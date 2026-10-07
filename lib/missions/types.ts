import type { MasteryState } from "@/types/study";

export type MissionType = "daily_review" | "weekly_summary";

export interface StudyMission {
  id: string;
  user_id: string;
  type: MissionType;
  topic_id: string | null;
  title: string;
  description: string | null;
  scheduled_for: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface MissionInput {
  user_id: string;
  type: MissionType;
  topic_id?: string | null;
  title: string;
  description?: string | null;
  scheduled_for: string;
}

export interface MissionTopic {
  id: string;
  name: string;
  subject_name: string | null;
  mastery_state: MasteryState;
  next_review_at: string | null;
  last_studied: string | null;
  resource_count: number;
}

export interface WeeklySessionSummary {
  sessionId: string;
  topicName: string;
  subjectName: string | null;
  accuracy: number;
  totalAttempts: number;
  correctAttempts: number;
  hintsUsed: number;
  durationMinutes: number | null;
}
