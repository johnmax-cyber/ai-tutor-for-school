import { AIService, AIError } from "@/lib/ai/types";
import { retrieveChunks, RetrievedChunk } from "./retrieve";
import { buildMessages, NOT_FOUND } from "./prompt";
import { parseModelOutput, finalizeAnswer } from "./grounding";
import { TutorAnswer } from "@/types/tutor";

export interface TutorInput {
  question: string;
  resourceId?: string;
  history: { role: "user" | "assistant"; content: string }[];
}

export interface TutorDeps {
  ai: AIService;
  retrieve: typeof retrieveChunks;
}

export async function handleTutorQuestion(
  deps: TutorDeps,
  input: TutorInput
): Promise<TutorAnswer> {
  const chunks = await deps.retrieve(input.question, input.resourceId);

  if (chunks.length === 0) {
    return {
      answer: NOT_FOUND,
      citations: [],
      grounded: false,
      insufficient_context: true,
      model: null,
    };
  }

  const messages = buildMessages(input.question, chunks, input.history);

  let parsed: { answer: string; insufficient_context: boolean } | null = null;
  let rawText = "";
  let model = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await deps.ai.chat(messages);
      rawText = result.text;
      model = result.model;
      parsed = parseModelOutput(rawText);
      if (parsed) {
        break;
      }
      // Retry with correction
      messages.push(
        { role: "assistant", content: rawText },
        { role: "user", content: "Reply with ONLY the JSON object." }
      );
    } catch (err) {
      if (err instanceof AIError) {
        throw err;
      }
      throw new AIError("unavailable", "AI service error");
    }
  }

  return finalizeAnswer(parsed, rawText, chunks, model);
}