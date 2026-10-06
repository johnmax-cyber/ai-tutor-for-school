export interface Citation {
  ref: number;
  chunk_id: string;
  resource_id: string;
  resource_title: string;
  page_number: number;
  content: string;
  rank: number;
}

export interface TutorAnswer {
  answer: string;
  citations: Citation[];
  grounded: boolean;
  insufficient_context: boolean;
  model: string | null;
}

export interface TutorChatMessage {
  role: "user" | "assistant";
  content: string;
}