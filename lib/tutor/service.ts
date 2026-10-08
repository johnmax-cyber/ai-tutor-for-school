import { AIService, AIError } from "@/lib/ai/types";
import { retrieveChunks, RetrievedChunk } from "./retrieve";
import { buildMessages, NOT_FOUND } from "./prompt";
import { parseModelOutput, finalizeAnswer } from "./grounding";
import { TutorAnswer } from "@/types/tutor";
import { describeImage, DescribeImageResult } from "@/lib/documents/vision";

export interface TutorInput {
  question: string;
  resourceId?: string;
  imageBuffer?: Uint8Array | null;
  imageMimeType?: string | null;
  imagePage?: number | null;
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
  const allChunks: RetrievedChunk[] = [...chunks];

  let visionResult: DescribeImageResult | null = null;

  // If an image is provided, use vision to describe it and add to context
  if (input.imageBuffer && input.imageMimeType) {
    try {
      visionResult = await describeImage(
        input.imageBuffer,
        input.imageMimeType,
        undefined,
        deps.ai
      );
       // Add vision description as a pseudo-chunk for citations
      const visionChunk: RetrievedChunk = {
        id: "vision-" + Date.now(),
        resource_id: input.resourceId ?? "vision",
        resource_title: "Image (vision)",
        page_number: input.imagePage ?? 0,
        chunk_index: -1,
        content: `[Image description] ${visionResult.description}`,
        rank: 1,
      };
      allChunks.unshift(visionChunk);
    } catch (err) {
      // Vision failure should not break the tutor flow
      console.warn("Tutor vision failed:", err instanceof Error ? err.message : String(err));
    }
  }

  if (allChunks.length === 0) {
    return {
      answer: NOT_FOUND,
      citations: [],
      grounded: false,
      insufficient_context: true,
      model: null,
    };
  }

  const messages = buildMessages(input.question, allChunks, input.history);

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

  const answer = finalizeAnswer(parsed, rawText, allChunks, model);

  // If vision was used, include vision model in the answer metadata
  if (visionResult) {
    return {
      ...answer,
      model: visionResult.model,
    };
  }

  return answer;
}