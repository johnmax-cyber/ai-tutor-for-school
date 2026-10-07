import { StudyDeps } from "./types";
import { CreateSessionResult, SubmitAttemptResult } from "./types";
import { 
  StudySession,
  StudyQuestion,
  AttemptResult
} from "@/types/study";
import { createClient } from "@/lib/supabase/server";
import { generateQuestion } from "@/lib/tutor/generate";
import { generateNextTurn } from "@/lib/tutor/generate";
import { retrieveChunksForTopic } from "@/lib/tutor/retrieve";
import { calculateMasteryState, calculateReviewDate } from "@/lib/study/mastery";
import { generateHandoff, HandoffInput, HandoffMistake } from "./handoff";
import { computeSessionAnalytics, computeTopicInsights, SessionAccuracy, computeStudyTips, computePerformanceTrend } from "./analytics";
import { SupabaseClient } from "@supabase/supabase-js";

export class StudySessionService {
  constructor(private deps: StudyDeps) {}

  private async getSupabase(): Promise<SupabaseClient> {
    if (this.deps.getSupabase) {
      return this.deps.getSupabase();
    }
    return createClient();
  }

  /**
   * Create a new study session for a topic
   */
  async createSession(
    userId: string,
    topicId: string
  ): Promise<CreateSessionResult> {
    const supabase = await this.getSupabase();
    
    // Verify topic ownership
    const { data: topic, error: topicError } = await supabase
      .from("topics")
      .select("id, name, subject_id, subjects(name)")
      .eq("id", topicId)
      .eq("user_id", userId)
      .single();

    if (topicError || !topic) {
      throw new Error("Topic not found or access denied");
    }

    // Check if topic has any ready resources
    const { data: topicResources } = await supabase
      .from("resources_topics")
      .select("resource_id")
      .eq("topic_id", topicId);

    const resourceIds = (topicResources || []).map((r: { resource_id: string }) => r.resource_id);

    if (resourceIds.length === 0) {
      throw new Error("Topic has no processed documents");
    }

    const { count: readyCount } = await supabase
      .from("resources")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "ready")
      .in("id", resourceIds);

    if (!readyCount || readyCount === 0) {
      throw new Error("Topic has no processed documents");
    }

    // Create session record
    const now = new Date().toISOString();
    const { data: session, error: sessionError } = await supabase
      .from("study_sessions")
      .insert({
        user_id: userId,
        topic_id: topicId,
        status: "active",
        started_at: now,
        questions_attempted: 0,
        total_attempts: 0,
        correct_attempts: 0,
        hints_used: 0,
      })
      .select()
      .single();

    if (sessionError || !session) {
      throw new Error("Failed to create study session");
    }

    // Retrieve chunks for the topic
    const chunks = this.deps.retrieve
      ? await this.deps.retrieve(topic.name, topicId)
      : await retrieveChunksForTopic(topic.name, topicId);

    // Generate first question
    const questionData = await generateQuestion(
      chunks,
      topic.name,
      this.deps.ai
    );

    // Save question to DB
    const { data: question, error: questionError } = await supabase
      .from("questions")
      .insert({
        user_id: userId,
        topic_id: topicId,
        session_id: session.id,
        content: questionData.question,
        answer_key: questionData.answer_key,
        explanation: questionData.explanation,
        hint: questionData.hint,
      })
      .select()
      .single();

    if (questionError || !question) {
      throw new Error("Failed to save question");
    }

    return {
      session: {
        id: session.id,
        topic_id: session.topic_id,
        topic_name: topic.name,
        subject_name: topic.subjects?.[0]?.name ?? null,
        subject_id: topic.subject_id ?? null,
        status: session.status,
        started_at: session.started_at,
        ended_at: session.ended_at,
        handoff_text: session.handoff_text,
        questions_attempted: session.questions_attempted,
        total_attempts: session.total_attempts,
        correct_attempts: session.correct_attempts,
        hints_used: session.hints_used,
      },
      question: {
        id: question.id,
        content: question.content,
        explanation: question.explanation,
        hint: question.hint,
        sources: [],
      }
    };
  }

  /**
   * Submit an attempt for a question in a study session
   */
  async submitAttempt(
    userId: string,
    sessionId: string,
    questionId: string,
    answer: string
  ): Promise<SubmitAttemptResult> {
    const supabase = await this.getSupabase();
    
    // Verify session ownership
    const { data: session, error: sessionError } = await supabase
      .from("study_sessions")
      .select("id, topic_id, status")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (sessionError || !session) {
      throw new Error("Session not found or access denied");
    }

    if (session.status !== "active") {
      throw new Error("Session is not active");
    }

    // Get the question with its answer key
    const { data: question, error: questionError } = await supabase
      .from("questions")
      .select("id, content, answer_key, explanation, hint, topic_id, concept_id")
      .eq("id", questionId)
      .eq("session_id", sessionId)
      .single();

    if (questionError || !question) {
      throw new Error("Question not found or not in session");
    }

    // Retrieve chunks for the topic (for context in evaluation)
    const { data: topic } = await supabase
      .from("topics")
      .select("name")
      .eq("id", question.topic_id)
      .single();

    if (!topic) {
      throw new Error("Topic not found");
    }

    const chunks = this.deps.retrieve
      ? await this.deps.retrieve(topic.name, question.topic_id)
      : await retrieveChunksForTopic(topic.name, question.topic_id);

    // Evaluate the attempt and generate next question
    const result = await generateNextTurn(
      {
        content: question.content,
        answer_key: question.answer_key,
        explanation: question.explanation,
        hint: question.hint,
      },
      answer,
      chunks,
      this.deps.ai
    );

    // Save the attempt
    const { data: attempt, error: attemptError } = await supabase
      .from("attempts")
      .insert({
        user_id: userId,
        question_id: questionId,
        session_id: sessionId,
        answer_text: answer,
        is_correct: result.is_correct,
        feedback: result.feedback,
        attempt_number: 1,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (attemptError || !attempt) {
      throw new Error("Failed to save attempt");
    }

    // Get the actual attempt number (count existing attempts for this question)
    const { count: attemptCount } = await supabase
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("question_id", questionId)
      .eq("session_id", sessionId);

    const attemptNumber = attemptCount ?? 1;

    // Update the attempt with the correct attempt number
    await supabase
      .from("attempts")
      .update({ attempt_number: attemptNumber })
      .eq("id", attempt.id);

    // Update mistakes if incorrect
    if (!result.is_correct) {
      // Check for existing similar mistake
      const { data: existingMistakes } = await supabase
        .from("mistakes")
        .select("id, incorrect_count, correct_count")
        .eq("user_id", userId)
        .eq("topic_id", question.topic_id)
        .ilike("description", `%${result.misconception ?? ""}%`);

      const mistakes = existingMistakes ?? [];
      if (mistakes.length > 0) {
        const mistake = mistakes[0];
        await supabase
          .from("mistakes")
          .update({
            incorrect_count: mistake.incorrect_count + 1,
            last_seen: new Date().toISOString(),
            recurring: (mistake.incorrect_count + 1 >= 2) && (mistake.correct_count < 2)
          })
          .eq("id", mistake.id);
      } else {
        await supabase
          .from("mistakes")
          .insert({
            user_id: userId,
            topic_id: question.topic_id,
            concept_id: question.concept_id ?? null,
            question_id: questionId,
            description: result.misconception ?? answer.substring(0, 100),
            incorrect_count: 1,
            correct_count: 0,
            hint_count: 0,
            last_seen: new Date().toISOString(),
            recurring: false,
          });
      }
    } else if (result.misconception) {
      // If AI detected a misconception but answer was correct, update correct count
      const { data: existingMistakes } = await supabase
        .from("mistakes")
        .select("id, correct_count")
        .eq("user_id", userId)
        .eq("topic_id", question.topic_id)
        .ilike("description", `%${result.misconception}%`);

      const mistakes = existingMistakes ?? [];
      if (mistakes.length > 0) {
        const mistake = mistakes[0];
        await supabase
          .from("mistakes")
          .update({ correct_count: mistake.correct_count + 1 })
          .eq("id", mistake.id);
      }
    }

    // Update mastery and topic stats
    await this.updateTopicMastery(userId, question.topic_id);

    // Prepare response
    const nextQuestion: StudyQuestion | null = result.next_question
      ? {
          id: "",
          content: result.next_question,
          explanation: result.explanation ?? "",
          hint: result.hint ?? "",
          sources: [],
        }
      : null;

    return {
      attempt: {
        id: attempt.id,
        is_correct: result.is_correct,
        feedback: result.feedback,
        hint: result.hint,
        attempt_number: attemptNumber,
      },
      nextQuestion,
    };
  }

  /**
   * End a study session and generate handoff
   */
  async endSession(
    userId: string,
    sessionId: string
  ): Promise<{ session: StudySession; handoff: string }> {
    const supabase = await this.getSupabase();
    
    // Verify session ownership
    const { data: session, error: sessionError } = await supabase
      .from("study_sessions")
      .select("*, topics(name, subject_id, subjects(name))")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (sessionError || !session) {
      throw new Error("Session not found or access denied");
    }

    if (session.status !== "active") {
      throw new Error("Session is not active");
    }

    // Get questions and attempts for this session
    const { data: questions } = await supabase
      .from("questions")
      .select("id, content, explanation, hint")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    const { data: attempts } = await supabase
      .from("attempts")
      .select("answer_text, is_correct, feedback, hint, attempt_number")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    // Get mistakes for the topic
    const { data: mistakes } = await supabase
      .from("mistakes")
      .select("description, incorrect_count, correct_count, hint_count, last_seen, recurring")
      .eq("user_id", userId)
      .eq("topic_id", session.topic_id);

    // Update topic mastery one final time
    await this.updateTopicMastery(userId, session.topic_id);

    // Compute session statistics from questions and attempts
    const questionsAttempted = questions?.length ?? 0;
    const totalAttemptsCount = attempts?.length ?? 0;
    const correctAttemptsCount = attempts?.filter(a => a.is_correct).length ?? 0;
    const hintsUsedCount = attempts?.filter(a => a.hint !== null && a.hint !== "").length ?? 0;

    // Generate handoff
    // Compute study tips and performance trend for handoff
    const accuracy = totalAttemptsCount > 0
      ? correctAttemptsCount / totalAttemptsCount
      : 0;
    const avgHints = questions?.length ?? 0 > 0
      ? hintsUsedCount / (questions?.length ?? 1)
      : 0;
    const recurringMistakes = (mistakes ?? [])
      .filter(m => m.recurring)
      .map(m => m.description);

    const studyTips = computeStudyTips({
      accuracy,
      avgHintsPerQuestion: avgHints,
      recurringMistakes,
      totalAttempts: totalAttemptsCount,
    });

    // Get historical sessions for trend (last 5 sessions)
    const { data: topicSessions } = await supabase
      .from("study_sessions")
      .select("total_attempts, correct_attempts")
      .eq("user_id", userId)
      .eq("topic_id", session.topic_id)
      .order("started_at", { ascending: true });

    const sessionAccuracies = (topicSessions ?? [])
      .filter(s => s.total_attempts > 0)
      .slice(-5)
      .map(s => ({
        sessionId: "",
        accuracy: s.correct_attempts / s.total_attempts,
      }));
    const performanceTrend = computePerformanceTrend(sessionAccuracies);

    const handoffInput: HandoffInput = {
      topicName: session.topics?.[0]?.name ?? "Unknown Topic",
      subjectName: session.topics?.[0]?.subjects?.[0]?.name ?? null,
      questionsCount: questions?.length ?? 0,
      totalAttempts: session.total_attempts,
      correctAttempts: session.correct_attempts,
      hintsUsed: hintsUsedCount,
      mistakes: (mistakes?.map(m => ({
        description: m.description,
        incorrect_count: m.incorrect_count,
        correct_count: m.correct_count,
        hint_count: m.hint_count,
        last_seen: m.last_seen,
        recurring: m.recurring
      })) as HandoffMistake[]) ?? [],
      masteryState: session.topics?.[0]?.mastery_state ?? "not_started",
      studyTips: studyTips.map(t => t.message),
      performanceTrend,
    };

    const handoffText = generateHandoff(handoffInput);

    // Update session with handoff and mark as completed
    const now = new Date().toISOString();
    const { data: updatedSession, error: updateError } = await supabase
      .from("study_sessions")
      .update({
        status: "completed",
        ended_at: now,
        handoff_text: handoffText,
        questions_attempted: questionsAttempted,
        total_attempts: totalAttemptsCount,
        correct_attempts: correctAttemptsCount,
        hints_used: hintsUsedCount,
      })
      .eq("id", sessionId)
      .select()
      .single();

    if (updateError || !updatedSession) {
      throw new Error("Failed to end session");
    }

    return {
      session: {
        id: updatedSession.id,
        topic_id: updatedSession.topic_id,
        topic_name: updatedSession.topics?.[0]?.name ?? "",
        subject_name: updatedSession.topics?.[0]?.subjects?.[0]?.name ?? null,
        subject_id: updatedSession.topics?.[0]?.subject_id ?? null,
        status: updatedSession.status,
        started_at: updatedSession.started_at,
        ended_at: updatedSession.ended_at,
        handoff_text: updatedSession.handoff_text,
        questions_attempted: updatedSession.questions_attempted,
        total_attempts: updatedSession.total_attempts,
        correct_attempts: updatedSession.correct_attempts,
        hints_used: updatedSession.hints_used,
      },
      handoff: handoffText
    };
  }

  /**
   * Get analytics for a specific study session
   */
  async getSessionAnalytics(
    userId: string,
    sessionId: string
  ): Promise<import("./types").SessionAnalytics> {
    const supabase = await this.getSupabase();

    // Verify session ownership
    const { data: session, error: sessionError } = await supabase
      .from("study_sessions")
      .select("id, topic_id, total_attempts, correct_attempts")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (sessionError || !session) {
      throw new Error("Session not found or access denied");
    }

    // Get questions for this session
    const { data: questions } = await supabase
      .from("questions")
      .select("id")
      .eq("session_id", sessionId)
      .eq("user_id", userId);

    const questionsCount = questions?.length ?? 0;

    // Get attempts for this session
    const { data: attempts } = await supabase
      .from("attempts")
      .select("is_correct, hint")
      .eq("session_id", sessionId)
      .eq("user_id", userId);

    const hintsUsed = attempts?.filter((a) => a.hint !== null && a.hint !== "").length ?? 0;

    // Get mistakes for the topic
    const { data: mistakes } = await supabase
      .from("mistakes")
      .select("description, incorrect_count, last_seen")
      .eq("user_id", userId)
      .eq("topic_id", session.topic_id)
      .eq("recurring", true);

    const commonMistakes = (mistakes ?? []).map((m) => ({
      description: m.description,
      occurrenceCount: m.incorrect_count,
      lastSeen: m.last_seen,
    }));

    // Get historical sessions for trend analysis (last 5 sessions)
    const { data: topicSessions } = await supabase
      .from("study_sessions")
      .select("id, total_attempts, correct_attempts")
      .eq("user_id", userId)
      .eq("topic_id", session.topic_id)
      .order("started_at", { ascending: true });

    const sessionAccuracies: SessionAccuracy[] = (topicSessions ?? [])
      .filter((s) => s.total_attempts > 0)
      .slice(-5)
      .map((s) => ({
        sessionId: s.id,
        accuracy: s.correct_attempts / s.total_attempts,
      }));

    return computeSessionAnalytics({
      sessionId: session.id,
      topicId: session.topic_id,
      totalAttempts: session.total_attempts,
      correctAttempts: session.correct_attempts,
      hintsUsed,
      questionsCount,
      mistakes: commonMistakes,
      sessionAccuracies,
    });
  }

  /**
   * Get analytics insights for a topic
   */
  async getTopicInsights(
    userId: string,
    topicId: string
  ): Promise<import("./types").TopicInsights> {
    const supabase = await this.getSupabase();

    // Verify topic ownership
    const { data: topic, error: topicError } = await supabase
      .from("topics")
      .select("id, name, mastery_state, next_review_at, total_attempts, correct_attempts")
      .eq("id", topicId)
      .eq("user_id", userId)
      .single();

    if (topicError || !topic) {
      throw new Error("Topic not found or access denied");
    }

    // Get all sessions for this topic
    const { data: sessions } = await supabase
      .from("study_sessions")
      .select("id, total_attempts, correct_attempts")
      .eq("user_id", userId)
      .eq("topic_id", topicId)
      .order("started_at", { ascending: true });

    const totalSessions = sessions?.length ?? 0;

    // Get all questions for this topic (across all sessions)
    const { data: questions } = await supabase
      .from("questions")
      .select("id, session_id")
      .eq("topic_id", topicId)
      .eq("user_id", userId);

    const questionIds = (questions ?? []).map((q) => q.id);
    const questionsCount = questions?.length ?? 0;

    // Get all attempts for these questions
    let totalAttempts = 0;
    let correctAttempts = 0;
    let hintsUsed = 0;

    if (questionIds.length > 0) {
      const { data: attempts } = await supabase
        .from("attempts")
        .select("is_correct, hint")
        .in("question_id", questionIds)
        .eq("user_id", userId);

      totalAttempts = attempts?.length ?? 0;
      correctAttempts = attempts?.filter((a) => a.is_correct).length ?? 0;
      hintsUsed = attempts?.filter((a) => a.hint !== null && a.hint !== "").length ?? 0;
    }

    // Get recurring mistakes for this topic
    const { data: mistakes } = await supabase
      .from("mistakes")
      .select("description, incorrect_count, last_seen")
      .eq("user_id", userId)
      .eq("topic_id", topicId)
      .eq("recurring", true);

    const commonMistakes = (mistakes ?? []).map((m) => ({
      description: m.description,
      occurrenceCount: m.incorrect_count,
      lastSeen: m.last_seen,
    }));

    // Compute session accuracies for trend analysis (last 5 sessions)
    const sessionAccuracies: SessionAccuracy[] = (sessions ?? [])
      .filter((s) => s.total_attempts > 0)
      .slice(-5)
      .map((s) => ({
        sessionId: s.id,
        accuracy: s.correct_attempts / s.total_attempts,
      }));

    return computeTopicInsights({
      topicId: topic.id,
      topicName: topic.name,
      masteryState: topic.mastery_state as import("./types").TopicInsights["masteryState"],
      nextReviewAt: topic.next_review_at,
      totalSessions,
      totalAttempts,
      correctAttempts,
      hintsUsed,
      questionsCount,
      mistakes: commonMistakes,
      sessionAccuracies,
    });
  }

  /**
   * List all study sessions for a user
   */
  async listSessions(userId: string): Promise<StudySession[]> {
    const supabase = await this.getSupabase();
    const { data: sessions, error } = await supabase
      .from("study_sessions")
      .select(`
        id,
        topic_id,
        topics(name, subject_id, subjects(name)),
        status,
        started_at,
        ended_at,
        handoff_text,
        questions_attempted,
        total_attempts,
        correct_attempts,
        hints_used
      `)
      .eq("user_id", userId)
      .order("started_at", { ascending: false });

    if (error) throw error;

    type SessionWithTopic = {
      id: string;
      topic_id: string;
      topics: Array<{
        name: string;
        subject_id: string | null;
        subjects: Array<{ name: string }>;
      }> | null;
      status: "active" | "completed" | "abandoned";
      started_at: string;
      ended_at: string | null;
      handoff_text: string | null;
      questions_attempted: number;
      total_attempts: number;
      correct_attempts: number;
      hints_used: number;
    };

    return (sessions || []).map((session: SessionWithTopic) => ({
      id: session.id,
      topic_id: session.topic_id,
      topic_name: session.topics?.[0]?.name ?? "",
      subject_name: session.topics?.[0]?.subjects?.[0]?.name ?? null,
      subject_id: session.topics?.[0]?.subject_id ?? null,
      status: session.status,
      started_at: session.started_at,
      ended_at: session.ended_at,
      handoff_text: session.handoff_text,
      questions_attempted: session.questions_attempted,
      total_attempts: session.total_attempts,
      correct_attempts: session.correct_attempts,
      hints_used: session.hints_used,
    }));
  }

  /**
   * Get a specific session with full details
   */
  async getSession(
    userId: string,
    sessionId: string
  ): Promise<{
    session: StudySession;
    questions: StudyQuestion[];
    attempts: AttemptResult[];
    handoff: string | null;
  }> {
    const supabase = await this.getSupabase();
    
    // Verify ownership and get session
    const { data: session, error: sessionError } = await supabase
      .from("study_sessions")
      .select(`
        id,
        topic_id,
        topics(name, subject_id, subjects(name)),
        status,
        started_at,
        ended_at,
        handoff_text,
        questions_attempted,
        total_attempts,
        correct_attempts,
        hints_used
      `)
      .eq("id", sessionId)
      .eq("user_id", userId)
      .single();

    if (sessionError || !session) {
      throw new Error("Session not found or access denied");
    }

    // Get questions
    const { data: questions, error: questionsError } = await supabase
      .from("questions")
      .select("id, content, explanation, hint")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (questionsError) throw questionsError;

    // Get attempts
    const { data: attemptsRaw, error: attemptsError } = await supabase
      .from("attempts")
      .select("answer_text, is_correct, feedback, hint, attempt_number")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (attemptsError) throw attemptsError;

    const attempts: AttemptResult[] = (attemptsRaw || []).map((a: {
      is_correct: boolean;
      feedback: string | null;
      hint: string | null;
      attempt_number: number;
    }) => ({
      id: "",
      is_correct: a.is_correct,
      feedback: a.feedback ?? "",
      hint: a.hint,
      attempt_number: a.attempt_number,
    }));

    return {
      session: {
        id: session.id,
        topic_id: session.topic_id,
        topic_name: session.topics?.[0]?.name ?? "",
        subject_name: session.topics?.[0]?.subjects?.[0]?.name ?? null,
        subject_id: session.topics?.[0]?.subject_id ?? null,
        status: session.status,
        started_at: session.started_at,
        ended_at: session.ended_at,
        handoff_text: session.handoff_text,
        questions_attempted: session.questions_attempted,
        total_attempts: session.total_attempts,
        correct_attempts: session.correct_attempts,
        hints_used: session.hints_used,
      },
      questions: (questions || []).map((q: {
        id: string;
        content: string;
        explanation: string | null;
        hint: string | null;
      }) => ({
        id: q.id,
        content: q.content,
        explanation: q.explanation ?? "",
        hint: q.hint ?? "",
        sources: [],
      })),
      attempts,
      handoff: session.handoff_text
    };
  }

  /**
   * Update mastery state for a topic based on recent attempts
   */
  private async updateTopicMastery(
    userId: string,
    topicId: string
  ): Promise<void> {
    const supabase = await this.getSupabase();
    
    // Get question IDs for this topic
    const { data: questions } = await supabase
      .from("questions")
      .select("id")
      .eq("topic_id", topicId);

    const questionIds = (questions || []).map((q: { id: string }) => q.id);

    if (questionIds.length === 0) {
      // No questions yet, set to not_started
      await supabase
        .from("topics")
        .update({
          mastery_state: "not_started",
          total_attempts: 0,
          correct_attempts: 0,
          last_studied: null,
          next_review_at: null,
        })
        .eq("id", topicId);
      return;
    }

    // Get attempts for these questions
    const { data: attempts } = await supabase
      .from("attempts")
      .select("is_correct, created_at")
      .eq("user_id", userId)
      .in("question_id", questionIds);

    if (!attempts || attempts.length === 0) {
      // No attempts yet, set to not_started
      await supabase
        .from("topics")
        .update({
          mastery_state: "not_started",
          total_attempts: 0,
          correct_attempts: 0,
          last_studied: null,
          next_review_at: null,
        })
        .eq("id", topicId);
      return;
    }

    const totalAttempts = attempts.length;
    const correctAttempts = attempts.filter(a => a.is_correct).length;
    const correctRate = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;

    // Calculate last 5 attempts accuracy
    const last5Attempts = attempts.slice(-5);
    const last5Correct = last5Attempts.filter(a => a.is_correct).length;
    const last5Accuracy = last5Attempts.length > 0 ? last5Correct / last5Attempts.length : 0;

    // Check if last 3 attempts were all correct
    const last3Attempts = attempts.slice(-3);
    const last3AllCorrect = last3Attempts.length === 3 && 
      last3Attempts.every(a => a.is_correct);

    // Check for recurring mistakes
    const { data: mistakes } = await supabase
      .from("mistakes")
      .select("recurring")
      .eq("user_id", userId)
      .eq("topic_id", topicId)
      .eq("recurring", true);

    const hasRecurringMistakes = Boolean(mistakes && mistakes.length > 0);

    const lastAttempt = attempts.length > 0 ? attempts[attempts.length - 1] : null;
    const lastStudiedDate = lastAttempt?.created_at
      ? new Date(lastAttempt.created_at)
      : (lastAttempt ? new Date() : null);

    // Calculate mastery state
    const masteryState = calculateMasteryState({
      totalAttempts,
      correctAttempts,
      correctRate,
      last5Accuracy,
      last3AllCorrect,
      hasRecurringMistakes,
      lastStudied: lastStudiedDate
    });

    // Calculate next review date
    const nextReviewAt = calculateReviewDate(masteryState);

    // Update topic
    await supabase
      .from("topics")
      .update({
        mastery_state: masteryState,
        total_attempts: totalAttempts,
        correct_attempts: correctAttempts,
        last_studied: lastStudiedDate ? lastStudiedDate.toISOString() : null,
        next_review_at: nextReviewAt ? nextReviewAt.toISOString() : null
      })
      .eq("id", topicId);
  }
}