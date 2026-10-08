export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface VisionResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  promptTokens: number;
}

export interface AIService {
  chat(messages: ChatMessage[]): Promise<AIResult>;
  vision(text: string, imageBase64: string, mimeType: string): Promise<VisionResult>;
  embeddings?(inputs: string[]): Promise<EmbeddingResult>;
  getCallLog?(): unknown[];
  getCallCount?(): number;
}

export class AIError extends Error {
  public readonly type: "config" | "auth" | "rate_limit" | "unavailable" | "bad_request";

  constructor(type: AIError["type"], message: string) {
    super(message);
    this.name = "AIError";
    this.type = type;
  }
}