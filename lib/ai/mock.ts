import { AIService, AIResult, ChatMessage } from "./types";

export function createMockAI(responses: string[]): AIService {
  const callLog: ChatMessage[][] = [];
  let callIndex = 0;

  return {
    async chat(messages: ChatMessage[]): Promise<AIResult> {
      callLog.push(messages);
      const text = responses[callIndex] ?? responses[responses.length - 1] ?? "";
      callIndex++;
      return {
        text,
        model: "mock-model",
        promptTokens: messages.reduce((sum, m) => sum + m.content.length, 0) / 4,
        completionTokens: text.length / 4,
      };
    },
    getCallLog(): ChatMessage[][] {
      return callLog;
    },
    getCallCount(): number {
      return callIndex;
    },
  };
}