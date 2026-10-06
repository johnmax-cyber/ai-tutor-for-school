export type MasteryState = "not_started" | "learning" | "developing" | "strong" | "review_needed";

export interface Subject {
  id: string;
  name: string;
  created_at: string;
}

export interface Topic {
  id: string;
  name: string;
  description: string;
  subject_name: string | null;
  subject_id: string | null;
  mastery_state: MasteryState;
  total_attempts: number;
  correct_attempts: number;
  hints_used: number;
  retry_count: number;
  last_studied: string | null;
  next_review_at: string | null;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
}

export interface StudySession {
  id: string;
  topic_id: string;
  topic_name: string;
  subject_name: string | null;
  subject_id: string | null;
  status: "active" | "completed" | "abandoned";
  started_at: string;
  ended_at: string | null;
  handoff_text: string | null;
  questions_attempted: number;
  total_attempts: number;
  correct_attempts: number;
  hints_used: number;
}

export interface StudyQuestion {
  id: string;
  content: string;
  explanation: string;
  hint: string;
  sources: Citation[];
}

export interface AttemptResult {
  id: string;
  is_correct: boolean;
  feedback: string;
  hint: string | null;
  attempt_number: number;
}

export interface Citation {
  chunk_id: string;
  resource_id: string;
  resource_title: string;
  page_number: number;
  content: string;
  rank: number;
}

export interface MistakePattern {
  id: string;
  user_id: string;
  topic_id: string | null;
  concept_id: string | null;
  question_id: string | null;
  description: string;
  incorrect_count: number;
  correct_count: number;
  hint_count: number;
  last_seen: string;
  recurring: boolean;
  created_at: string;
  updated_at: string;
}

export interface NextQuestion {
  question_id: string;
  content: string;
  explanation: string;
  hint: string;
  sources: Citation[];
}

export interface AttemptResponse {
  attempt: AttemptResult;
  nextQuestion: NextQuestion | null; // null when waiting for retry
}