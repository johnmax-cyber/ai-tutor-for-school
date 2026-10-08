import OpenAI from "openai";
import { AIError, AIResult, AIService, ChatMessage, VisionResult } from "./types";

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

function getVisionConfig() {
  const apiKey = process.env.AI_VISION_API_KEY || process.env.AI_API_KEY;
  const baseURL = process.env.AI_VISION_BASE_URL || process.env.AI_BASE_URL;
  const model = process.env.AI_VISION_MODEL || process.env.AI_MODEL;

  if (!apiKey) {
    throw new AIError("config", "AI_VISION_API_KEY not configured");
  }
  if (!model) {
    throw new AIError("config", "AI_VISION_MODEL not configured");
  }

  return { apiKey, baseURL, model };
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

    async vision(text: string, imageBase64: string, mimeType: string): Promise<VisionResult> {
      const { apiKey, baseURL, model } = getVisionConfig();

      const client = new OpenAI({
        apiKey,
        baseURL,
        maxRetries: 1,
        timeout: 60000,
      });

      const start = Date.now();

      try {
        const completion = await client.chat.completions.create({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
              ],
            },
          ],
        });

        const latency = Date.now() - start;
        const promptTokens = completion.usage?.prompt_tokens ?? 0;
        const completionTokens = completion.usage?.completion_tokens ?? 0;

        console.log(`AI vision call: model=${model} promptTokens=${promptTokens} completionTokens=${completionTokens} latency=${latency}ms`);

        return {
          text: completion.choices[0]?.message?.content ?? "",
          model: completion.model,
          promptTokens,
          completionTokens,
        };
      } catch (err) {
        throw mapProviderError(err);
      }
    },
  };
}