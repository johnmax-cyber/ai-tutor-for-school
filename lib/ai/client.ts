import OpenAI from "openai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { AIError, AIResult, AIService, ChatMessage, EmbeddingResult, VisionResult } from "./types";

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

      if (!apiKey || !model) {
        throw new AIError("config", "AI_API_KEY or AI_MODEL not configured");
      }

      const start = Date.now();
      const client = new OpenAI({
        apiKey,
        baseURL,
        maxRetries: 0,
        timeout: 45000,
      });

      try {
        const completion = await client.chat.completions.create({
          model,
          messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
        });

        const latency = Date.now() - start;
        const promptTokens = completion.usage?.prompt_tokens ?? 0;
        const completionTokens = completion.usage?.completion_tokens ?? 0;

        console.log(`AI call (primary): model=${model} promptTokens=${promptTokens} completionTokens=${completionTokens} latency=${latency}ms`);

        return {
          text: completion.choices[0]?.message?.content ?? "",
          model: completion.model,
          promptTokens,
          completionTokens,
        };
      } catch (err) {
        console.warn("Primary AI provider failed, trying fallback:", err instanceof Error ? err.message : err);

        const groqKey = process.env.GROQ_API_KEY;
        const groqModel = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
        if (groqKey) {
          try {
            const groq = createOpenAI({
              baseURL: "https://api.groq.com/openai/v1",
              apiKey: groqKey,
            });
             
             const result = await generateText({
               model: groq(groqModel),
               // eslint-disable-next-line @typescript-eslint/no-explicit-any
               messages: messages as any,
               maxRetries: 1,
               timeout: 45000,
             });
             console.log(`AI call (fallback-Groq): model=${groqModel}`);
              return {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                model: ((result as any).model as string) || groqModel,
                text: result.text,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                promptTokens: Number(((result.usage as any) as Record<string, unknown>)?.inputTokens ?? ((result.usage as any) as Record<string, unknown>)?.outputTokens ?? 0),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                completionTokens: Number(((result.usage as any) as Record<string, unknown>)?.outputTokens ?? ((result.usage as any) as Record<string, unknown>)?.completionTokens ?? 0),
              };
          } catch (fallbackErr) {
            console.warn("Groq fallback failed:", fallbackErr instanceof Error ? fallbackErr.message : fallbackErr);
          }
        }

        const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        const geminiModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";
        if (geminiKey) {
          try {
            const google = createGoogleGenerativeAI({
              apiKey: geminiKey,
            });
             
             const result = await generateText({
               model: google(geminiModel),
               // eslint-disable-next-line @typescript-eslint/no-explicit-any
               messages: messages as any,
               maxRetries: 1,
               timeout: 45000,
             });
             console.log(`AI call (fallback-Gemini): model=${geminiModel}`);
              return {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                model: ((result as any).model as string) || geminiModel,
                text: result.text,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                promptTokens: Number(((result.usage as any) as Record<string, unknown>)?.inputTokens ?? ((result.usage as any) as Record<string, unknown>)?.outputTokens ?? 0),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                completionTokens: Number(((result.usage as any) as Record<string, unknown>)?.outputTokens ?? ((result.usage as any) as Record<string, unknown>)?.completionTokens ?? 0),
              };
          } catch (fallbackErr) {
            console.warn("Gemini fallback failed:", fallbackErr instanceof Error ? fallbackErr.message : fallbackErr);
          }
        }

        throw mapProviderError(err);
      }
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

    async embeddings(inputs: string[]): Promise<EmbeddingResult> {
      const model = process.env.AI_EMBEDDING_MODEL;
      if (!model) {
        throw new AIError("config", "AI_EMBEDDING_MODEL not configured");
      }

      const apiKey = process.env.AI_EMBEDDING_API_KEY ?? process.env.AI_API_KEY;
      if (!apiKey) {
        throw new AIError("config", "AI_EMBEDDING_API_KEY or AI_API_KEY not configured");
      }

      const baseURL = process.env.AI_EMBEDDING_BASE_URL ?? process.env.AI_BASE_URL;
      if (!baseURL) {
        throw new AIError("config", "AI_EMBEDDING_BASE_URL or AI_BASE_URL not configured");
      }

      const client = new OpenAI({
        apiKey,
        baseURL,
        maxRetries: 1,
        timeout: 30000,
      });

      const start = Date.now();

      try {
        const response = await client.embeddings.create({
          model,
          input: inputs,
          encoding_format: "float",
        });

        const latency = Date.now() - start;
        const vectors = response.data.map((d) => d.embedding);
        const promptTokens = response.usage?.prompt_tokens ?? 0;

        console.log(`embedding call: model=${model} chunks=${inputs.length} tokens=${promptTokens} latency=${latency}ms`);

        return {
          vectors,
          model: response.model,
          promptTokens,
        };
      } catch (err) {
        if (err instanceof OpenAI.APIError && err.status === 400) {
          const message = err.message.toLowerCase();
          if (message.includes("too long") || message.includes("maximum context length")) {
            throw new AIError("bad_request", `Embedding input too long: ${err.message}`);
          }
        }
        throw mapProviderError(err);
      }
    },
  };
}