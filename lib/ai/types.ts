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

export interface AIService {
  chat(messages: ChatMessage[]): Promise<AIResult>;
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