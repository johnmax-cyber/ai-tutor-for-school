import { AIService } from "@/lib/ai/types";
import { retrieveChunksForTopic } from "@/lib/tutor/retrieve";
import { StudySession, StudyQuestion, AttemptResult } from "@/types/study";
import { SupabaseClient } from "@supabase/supabase-js";

export interface SessionAnalytics {
  sessionId: string;
  topicId: string;
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
  hintsUsed: number;
  avgHintsPerQuestion: number;
  studyTips: StudyTip[];
  performanceTrend: PerformanceTrend;
  commonMistakes: CommonMistake[];
}

export interface TopicInsights {
  topicId: string;
  topicName: string;
  masteryState: "not_started" | "learning" | "developing" | "strong" | "review_needed";
  nextReviewAt: string | null;
  totalSessions: number;
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
  avgHintsPerQuestion: number;
  commonMistakes: CommonMistake[];
  studyTips: StudyTip[];
  performanceTrend: PerformanceTrend;
}

export interface StudyTip {
  message: string;
  category: "accuracy" | "hints" | "mistakes" | "progress";
}

export interface CommonMistake {
  description: string;
  occurrenceCount: number;
  lastSeen: string;
}

export type PerformanceTrend = "improving" | "stable" | "declining" | "insufficient_data";

export interface StudyDeps {
  ai: AIService;
  retrieve: typeof retrieveChunksForTopic;
  getSupabase?: () => Promise<SupabaseClient>;
}

export interface CreateSessionResult {
  session: StudySession;
  question: StudyQuestion; // answer_key is stored in DB but not returned to client
}

export interface SubmitAttemptResult {
  attempt: AttemptResult;
  nextQuestion: StudyQuestion | null;
}