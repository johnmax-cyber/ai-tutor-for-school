import { createClient } from "@/lib/supabase/server";
import { extractKeywords } from "./keywords";
import { createAIService } from "@/lib/ai/client";
import { getEmbeddingModelConfig } from "@/lib/ai/embeddings";

export interface RetrievedChunk {
  id: string;
  resource_id: string;
  resource_title: string;
  page_number: number;
  chunk_index: number;
  content: string;
  rank: number;
}

async function embedQuestion(text: string): Promise<number[] | null> {
  try {
    const config = getEmbeddingModelConfig();
    if (!config) {
      return null;
    }

    const ai = createAIService();
    if (!ai.embeddings) {
      return null;
    }
    const result = await ai.embeddings([text]);
    return result.vectors[0] ?? null;
  } catch (err) {
    console.error("embedQuestion error:", err);
    return null;
  }
}

export async function retrieveChunks(
  question: string,
  resourceId?: string
): Promise<RetrievedChunk[]> {
  const { terms, tsQuery } = extractKeywords(question);
  if (terms.length === 0) {
    return [];
  }

  const supabase = await createClient();

  try {
    const queryEmbedding = await embedQuestion(tsQuery);
    if (queryEmbedding) {
      const { data, error } = await supabase.rpc("search_resource_chunks_hybrid", {
        p_query: tsQuery,
        p_query_embedding: queryEmbedding,
        p_resource_id: resourceId ?? null,
        p_limit: 12,
        p_hybrid_weight: 0.5,
        p_min_similarity: 0.0,
      });

      if (error) {
        console.error("search_resource_chunks_hybrid error:", error);
      } else if (data && data.length > 0) {
        return data as RetrievedChunk[];
      }
    }
  } catch (err) {
    console.error("retrieveChunks embedding fallback:", err);
  }

  const { data, error } = await supabase.rpc("search_resource_chunks", {
    p_query: tsQuery,
    p_limit: 12,
    p_resource_id: resourceId ?? null,
  });

  if (error) {
    console.error("search_resource_chunks error:", error);
    return [];
  }

  return (data ?? []) as RetrievedChunk[];
}

export async function retrieveChunksForTopic(
  topicName: string,
  topicId: string
): Promise<RetrievedChunk[]> {
  const supabase = await createClient();
  const { terms, tsQuery } = extractKeywords(topicName);
  
  if (terms.length === 0) {
    return [];
  }

  try {
    const queryEmbedding = await embedQuestion(tsQuery);
    if (queryEmbedding) {
      const { data, error } = await supabase.rpc("search_resource_chunks_by_topic_hybrid", {
        p_topic_id: topicId,
        p_query: tsQuery,
        p_query_embedding: queryEmbedding,
        p_limit: 12,
        p_hybrid_weight: 0.5,
        p_min_similarity: 0.0,
      });

      if (error) {
        console.error("search_resource_chunks_by_topic_hybrid error:", error);
      } else if (data && data.length > 0) {
        return data as RetrievedChunk[];
      }
    }
  } catch (err) {
    console.error("retrieveChunksForTopic embedding fallback:", err);
  }

  const { data, error } = await supabase
    .rpc("search_resource_chunks_by_topic", {
      p_query: tsQuery,
      p_limit: 12,
      p_topic_id: topicId
    });

  if (error) {
    console.error("search_resource_chunks_by_topic error:", error);
    return [];
  }

  return (data ?? []) as RetrievedChunk[];
}
