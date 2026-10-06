import { AIService } from "@/lib/ai/types";
import { retrieveChunksForTopic } from "@/lib/tutor/retrieve";
import { StudySession, StudyQuestion, AttemptResult } from "@/types/study";

export interface StudyDeps {
  ai: AIService;
  retrieve: typeof retrieveChunksForTopic;
}

export interface CreateSessionResult {
  session: StudySession;
  question: StudyQuestion; // answer_key is stored in DB but not returned to client
}

export interface SubmitAttemptResult {
  attempt: AttemptResult;
  nextQuestion: StudyQuestion | null;
}