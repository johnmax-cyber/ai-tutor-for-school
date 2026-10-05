import { createClient } from "@/lib/supabase/server";
import { extractKeywords } from "./keywords";

export interface RetrievedChunk {
  id: string;
  resource_id: string;
  resource_title: string;
  page_number: number;
  chunk_index: number;
  content: string;
  rank: number;
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