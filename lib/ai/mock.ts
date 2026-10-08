import { AIService, AIResult, ChatMessage, VisionResult } from "./types";

export interface MockAIService extends AIService {
  getVisionCallLog(): Array<{ text: string; mimeType: string }>;
  getVisionCallCount(): number;
}

export function createMockAI(responses: string[], visionResponses?: string[]): MockAIService {
  const callLog: ChatMessage[][] = [];
  const visionCallLog: Array<{ text: string; mimeType: string }> = [];
  let callIndex = 0;
  let visionCallIndex = 0;

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
    async vision(text: string, _imageBase64: string, mimeType: string): Promise<VisionResult> {
      visionCallLog.push({ text, mimeType });
      const response = visionResponses?.[visionCallIndex] ?? visionResponses?.[visionResponses.length - 1];
      visionCallIndex++;
      if (response === undefined) {
        throw new Error(`No vision response prepared (call #${visionCallIndex})`);
      }
      return {
        text: response,
        model: "mock-vision-model",
        promptTokens: text.length / 4,
        completionTokens: response.length / 4,
      };
    },
    getCallLog(): ChatMessage[][] {
      return callLog;
    },
    getCallCount(): number {
      return callIndex;
    },
    getVisionCallLog(): Array<{ text: string; mimeType: string }> {
      return visionCallLog;
    },
    getVisionCallCount(): number {
      return visionCallIndex;
    },
  };
}