import OpenAI from "openai";
import { AIError, AIResult, AIService, ChatMessage } from "./types";

export function mapProviderError(err: unknown): AIError {
  if (err instanceof OpenAI.APIError) {
    const status = err.status;
    if (status === 401 || status === 403) {
      return new AIError("auth", "AI provider authentication failed");
    }
    if (status === 429) {
      return new AIError("rate_limit", "AI provider rate limited");
    }
    if (status === 400) {
      return new AIError("bad_request", "AI provider bad request");
    }
    if (status >= 500) {
      return new AIError("unavailable", "AI provider unavailable");
    }
  }
  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    if (message.includes("timeout") || message.includes("econnreset") || message.includes("etimedout")) {
      return new AIError("unavailable", "AI provider timeout");
    }
    if (message.includes("network") || message.includes("fetch failed")) {
      return new AIError("unavailable", "AI provider network error");
    }
  }
  return new AIError("unavailable", "AI provider error");
}

export function createAIService(): AIService {
  return {
    async chat(messages: ChatMessage[]): Promise<AIResult> {
      const apiKey = process.env.AI_API_KEY;
      const baseURL = process.env.AI_BASE_URL;
      const model = process.env.AI_MODEL;

      if (!apiKey) {
        throw new AIError("config", "AI_API_KEY not configured");
      }
      if (!model) {
        throw new AIError("config", "AI_MODEL not configured");
      }

      const client = new OpenAI({
        apiKey,
        baseURL,
        maxRetries: 1,
        timeout: 45000,
      });

      const start = Date.now();
      let result: AIResult;

      try {
        const completion = await client.chat.completions.create({
          model,
          messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        });

        const latency = Date.now() - start;
        const promptTokens = completion.usage?.prompt_tokens ?? 0;
        const completionTokens = completion.usage?.completion_tokens ?? 0;

        console.log(`AI call: model=${model} promptTokens=${promptTokens} completionTokens=${completionTokens} latency=${latency}ms`);

        result = {
          text: completion.choices[0]?.message?.content ?? "",
          model: completion.model,
          promptTokens,
          completionTokens,
        };
      } catch (err) {
        throw mapProviderError(err);
      }

      return result;
    },
  };
}