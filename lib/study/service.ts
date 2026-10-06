import { StudyDeps } from "./types";
import { 
  CreateSessionResult, 
  SubmitAttemptResult,
  StudySession,
  StudyQuestion,
  AttemptResult
} from "@/types/study";
import { createClient } from "@/lib/supabase/server";
import { generateQuestion } from "@/lib/tutor/generate";
import { generateNextTurn } from "@/lib/tutor/generate";
import { retrieveChunksForTopic } from "@/lib/tutor/retrieve";
import { calculateMasteryState, calculateReviewDate, TopicStats } from "@/lib/study/mastery";
import { generateHandoff } from "./handoff";

export class StudySessionService {
  constructor(private deps: StudyDeps) {}

  private async getSupabase() {
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
      .select("id, name, subject_id, subjects(name as subject_name)")
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

    const resourceIds = (topicResources || []).map((r: any) => r.resource_id);

    if (resourceIds.length === 0) {
      throw new Error("Topic has no processed documents");
    }

    const { count: readyCount } = await supabase
      .from("resources")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "ready")
      .in("id", resourceIds);

    if (!readyCount || readyCount.count === 0) {
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
    const chunks = await retrieveChunksForTopic(topic.name, topicId);

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
        subject_name: topic.subject_name ?? null,
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
      .select("id, content, answer_key, explanation, topic_id")
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

    const chunks = await retrieveChunksForTopic(topic.name, question.topic_id);

    // Evaluate the attempt and generate next question
    const result = await generateNextTurn(
      {
        id: question.id,
        content: question.content,
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

      if (existingMistakes.length > 0) {
        const mistake = existingMistakes[0];
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

      if (existingMistakes.length > 0) {
        const mistake = existingMistakes[0];
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
      .select("*, topics(name, subjects(name as subject_name))")
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

    // Generate handoff
    const handoffInput: any = {
      topicName: session.topics?.name ?? "Unknown Topic",
      subjectName: session.topics?.subjects?.subject_name ?? null,
      questionsCount: questions?.length ?? 0,
      totalAttempts: session.total_attempts,
      correctAttempts: session.correct_attempts,
      hintsUsed: session.hints_used,
      mistakes: mistakes?.map(m => ({
        description: m.description,
        incorrect_count: m.incorrect_count,
        correct_count: m.correct_count,
        hint_count: m.hint_count,
        last_seen: m.last_seen,
        recurring: m.recurring
      })) ?? [],
      masteryState: session.topics?.mastery_state ?? "not_started"
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
        questions_attempted: session.questions_attempted,
        total_attempts: session.total_attempts,
        correct_attempts: session.correct_attempts,
        hints_used: session.hints_used,
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
        topic_name: updatedSession.topics?.name ?? "",
        subject_name: updatedSession.topics?.subjects?.subject_name ?? null,
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
   * List all study sessions for a user
   */
  async listSessions(userId: string): Promise<StudySession[]> {
    const supabase = await this.getSupabase();
    const { data: sessions, error } = await supabase
      .from("study_sessions")
      .select(`
        id,
        topic_id,
        topics(name, subjects(name as subject_name)),
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
      .order("started_at", { descending: true });

    if (error) throw error;

    return (sessions || []).map((session: any) => ({
      id: session.id,
      topic_id: session.topic_id,
      topic_name: session.topics?.name ?? "",
      subject_name: session.topics?.subjects?.subject_name ?? null,
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
        topics(name, subjects(name as subject_name)),
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

    const attempts: AttemptResult[] = (attemptsRaw || []).map((a: any) => ({
      id: "",
      is_correct: a.is_correct,
      feedback: a.feedback,
      hint: a.hint,
      attempt_number: a.attempt_number,
    }));

    return {
      session: {
        id: session.id,
        topic_id: session.topic_id,
        topic_name: session.topics?.name ?? "",
        subject_name: session.topics?.subjects?.subject_name ?? null,
        status: session.status,
        started_at: session.started_at,
        ended_at: session.ended_at,
        handoff_text: session.handoff_text,
        questions_attempted: session.questions_attempted,
        total_attempts: session.total_attempts,
        correct_attempts: session.correct_attempts,
        hints_used: session.hints_used,
      },
      questions: (questions || []).map((q: any) => ({
        id: q.id,
        content: q.content,
        explanation: q.explanation,
        hint: q.hint,
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

    const questionIds = (questions || []).map((q: any) => q.id);

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

    const hasRecurringMistakes = mistakes && mistakes.length > 0;

    // Calculate mastery state
    const masteryState = calculateMasteryState({
      totalAttempts,
      correctAttempts,
      correctRate,
      last5Accuracy,
      last3AllCorrect,
      hasRecurringMistakes,
      lastStudied: attempts.length > 0 ? new Date(attempts[attempts.length - 1].created_at) : null
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
        last_studied: attempts.length > 0 ? new Date(attempts[attempts.length - 1].created_at).toISOString() : null,
        next_review_at: nextReviewAt ? nextReviewAt.toISOString() : null
      })
      .eq("id", topicId);
  }
}