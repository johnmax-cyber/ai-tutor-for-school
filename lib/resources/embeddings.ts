import type { SupabaseClient } from "@supabase/supabase-js";
import type { AIService } from "@/lib/ai/types";
import { getEmbeddingModelConfig } from "@/lib/ai/embeddings";
import { computeContentHash } from "@/lib/documents/chunking";

export const MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE = parseInt(
  process.env.MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE ?? "200",
  10,
);

export interface EmbedChunkRow {
  id: string;
  resource_id: string;
  user_id: string;
  content: string;
  content_hash: string | null;
  embedding: number[] | null;
  embedding_model: string | null;
  embedding_dim: number | null;
  embedding_skipped: boolean;
}

export interface EmbedResult {
  embedded: number;
  skipped: number;
  failed: number;
  nextCursor?: string | null;
  status: "completed" | "partial" | "failed";
  error?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRetryAfter(err: unknown): Promise<void> {
  if (err instanceof Error) {
    const match = err.message.match(/retry-after[:\s]+(\d+)/i);
    if (match) {
      const seconds = parseInt(match[1], 10);
      if (Number.isFinite(seconds) && seconds > 0) {
        await sleep(seconds * 1000);
        return;
      }
    }
  }
  await sleep(2000);
}

async function callEmbeddingsWithRetry(
  ai: AIService,
  texts: string[],
): Promise<{ vectors: number[][]; model: string; promptTokens: number }> {
  const maxAttempts = 3;
  let attempt = 0;
  let lastErr: unknown;

  while (attempt < maxAttempts) {
    try {
      if (!ai.embeddings) {
        throw new Error("AI service does not support embeddings");
      }
      const result = await ai.embeddings(texts);
      return result;
    } catch (err) {
      lastErr = err;
      attempt++;
      if (attempt >= maxAttempts) {
        break;
      }
      if (err instanceof Error && /429|5\d\d/.test(err.message)) {
        await waitForRetryAfter(err);
      } else {
        break;
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function logEmbeddingUsage(params: {
  supabase: SupabaseClient;
  resourceId: string;
  userId: string;
  chunks: number;
  tokens: number;
  model: string;
  status: string;
  error?: string;
}): Promise<void> {
  const { supabase, resourceId, userId, chunks, tokens, model, status, error: errorParam } = params;
  return (async () => {
    const { error: insertError } = await supabase
      .from("embedding_usage_log")
      .insert({
        resource_id: resourceId,
        user_id: userId,
        chunk_count: chunks,
        prompt_tokens: tokens,
        model,
        status,
        error: errorParam ?? null,
      });

    if (insertError) {
      console.error(`embedding_usage_log insert error [${resourceId}]:`, insertError.message);
    }
  })();
}

export async function embedPendingChunks(
  userId: string,
  resourceId?: string,
  batchSize = 50,
  ai?: AIService,
): Promise<EmbedResult> {
  const config = getEmbeddingModelConfig();
  if (!config) {
    return { embedded: 0, skipped: 0, failed: 0, status: "completed" };
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  let embeddedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let status: "completed" | "partial" | "failed" = "completed";
  let fatalError: string | undefined;

  if (!ai) {
    const { createAIService } = await import("@/lib/ai/client");
    ai = createAIService();
  }

  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("resource_chunks")
      .select("id, resource_id, user_id, content, content_hash, embedding, embedding_model, embedding_dim, embedding_skipped")
      .eq("user_id", userId)
      .eq("embedding_skipped", false)
      .or(`embedding.is.null,embedding_model.neq.${config.model},embedding_dim.neq.${config.dimensions}`)
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (resourceId) {
      query = query.eq("resource_id", resourceId);
    }

    if (cursor) {
      query = query.gt("id", cursor);
    }

    const { data: batches, error: fetchError } = await query;

    if (fetchError) {
      console.error(`embedPendingChunks fetch error [${userId}]:`, fetchError.message);
      return {
        embedded: embeddedCount,
        skipped: skippedCount,
        failed: failedCount,
        status: "failed",
        error: fetchError.message,
      };
    }

    const batch = batches as EmbedChunkRow[] | null;
    if (!batch || batch.length === 0) {
      hasMore = false;
      break;
    }

    const resourceChunkCounts = new Map<string, number>();
    for (const row of batch) {
      const current = resourceChunkCounts.get(row.resource_id) ?? 0;
      resourceChunkCounts.set(row.resource_id, current + 1);
    }

    for (const resourceId of resourceChunkCounts.keys()) {
      const count = resourceChunkCounts.get(resourceId) ?? 0;
      if (count > MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE) {
        const _excess = count - MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE;
        const excessRows = batch
          .filter((r) => r.resource_id === resourceId)
          .slice(MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE);

        for (const row of excessRows) {
          await supabase
            .from("resource_chunks")
            .update({ embedding_skipped: true })
            .eq("id", row.id);
          skippedCount++;
        }
      }
    }

    const eligible = batch.filter((row) => {
      if (row.embedding_skipped) return false;
      const needsEmbed = row.embedding == null || row.embedding_model !== config.model || row.embedding_dim !== config.dimensions;
      return needsEmbed;
    });

    if (eligible.length === 0) {
      cursor = batch[batch.length - 1].id;
      continue;
    }

    const texts = eligible.map((r) => r.content);

    try {
      const result = await callEmbeddingsWithRetry(ai, texts);

      for (let i = 0; i < eligible.length; i++) {
        const row = eligible[i];
      const _hash = row.content_hash ?? computeContentHash(row.content);

        const { error: updateError } = await supabase
          .from("resource_chunks")
          .update({
            embedding: result.vectors[i],
            embedding_model: result.model,
            embedding_dim: config.dimensions,
            embedding_created_at: new Date().toISOString(),
            content_hash: _hash,
          })
          .eq("id", row.id);

        if (updateError) {
          console.error(`embedPendingChunks update error [${row.id}]:`, updateError.message);
          failedCount++;
        } else {
          embeddedCount++;
        }
      }

      await logEmbeddingUsage({
        supabase,
        resourceId: eligible[0].resource_id,
        userId,
        chunks: eligible.length,
        tokens: result.promptTokens,
        model: result.model,
        status: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (/401|403|400|404/.test(message) && !/429|5\d\d/.test(message)) {
        status = "failed";
        fatalError = message;
        hasMore = false;
      } else {
        status = "partial";
      }

      const isPerChunk = /too long/i.test(message);

      for (const row of eligible) {
        if (isPerChunk) {
          await supabase
            .from("resource_chunks")
            .update({ embedding_skipped: true })
            .eq("id", row.id);
          skippedCount++;
        } else {
          failedCount++;
        }
      }

      await logEmbeddingUsage({
        supabase,
        resourceId: eligible[0].resource_id,
        userId,
        chunks: eligible.length,
        tokens: 0,
        model: config.model,
        status: "error",
        error: message,
      });

      if (fatalError) {
        break;
      }
    }

    cursor = batch[batch.length - 1].id;

    const remainingQuery = supabase
      .from("resource_chunks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("embedding_skipped", false)
      .or(`embedding.is.null,embedding_model.neq.${config.model},embedding_dim.neq.${config.dimensions}`);

    if (resourceId) {
      remainingQuery.eq("resource_id", resourceId);
    }

    const { count: remaining } = await remainingQuery;
    if (remaining === 0) {
      hasMore = false;
    }
  }

  return {
    embedded: embeddedCount,
    skipped: skippedCount,
    failed: failedCount,
    nextCursor: cursor,
    status,
    error: fatalError,
  };
}
