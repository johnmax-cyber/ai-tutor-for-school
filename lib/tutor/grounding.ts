import { z } from "zod";
import { RetrievedChunk } from "./retrieve";
import { Citation, TutorAnswer } from "@/types/tutor";
import { NOT_FOUND } from "./prompt";

const modelOutputSchema = z.object({
  answer: z.string(),
  insufficient_context: z.boolean(),
});

export function parseModelOutput(raw: string): { answer: string; insufficient_context: boolean } | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  const jsonText = raw.slice(start, end + 1);
  try {
    const parsed = JSON.parse(jsonText);
    const result = modelOutputSchema.safeParse(parsed);
    if (!result.success) {
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}

export function finalizeAnswer(
  parsed: { answer: string; insufficient_context: boolean } | null,
  rawText: string,
  chunks: RetrievedChunk[],
  model: string
): TutorAnswer {
  if (!parsed) {
    return {
      answer: NOT_FOUND,
      citations: [],
      grounded: false,
      insufficient_context: true,
      model,
    };
  }

  // Find all [N] markers in the answer
  const citationMatches = parsed.answer.match(/\[(\d+)\]/g);
  const validRefs = new Set<number>();
  if (citationMatches) {
    for (const match of citationMatches) {
      const n = parseInt(match.slice(1, -1), 10);
      if (n >= 1 && n <= chunks.length) {
        validRefs.add(n);
      }
    }
  }

  const sortedRefs = Array.from(validRefs).sort((a, b) => a - b);
  const citations: Citation[] = sortedRefs.map((ref) => {
    const chunk = chunks[ref - 1];
    return {
      ref,
      chunk_id: chunk.id,
      resource_id: chunk.resource_id,
      resource_title: chunk.resource_title,
      page_number: chunk.page_number,
      content: chunk.content,
    };
  });

  const grounded = citations.length > 0 && !parsed.insufficient_context;

  if (!grounded) {
    return {
      answer: NOT_FOUND,
      citations: [],
      grounded: false,
      insufficient_context: true,
      model,
    };
  }

  return {
    answer: parsed.answer,
    citations,
    grounded: true,
    insufficient_context: false,
    model,
  };
}