import type { PageChunk } from "@/lib/documents/chunking";

export type ResourceStatus = "uploaded" | "processing" | "ready" | "failed";

export interface Resource {
  id: string;
  user_id: string;
  title: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  char_count: number | null;
  status: ResourceStatus;
  error_message: string | null;
  extracted_text: string | null;
  page_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface ResourceChunk {
  id: string;
  resource_id: string;
  user_id: string;
  page_number: number;
  chunk_index: number;
  char_start: number;
  char_end: number;
  content: string;
  token_count: number;
  created_at: string;
  updated_at: string;
}

export function toChunkInsert(chunk: PageChunk, resourceId: string, userId: string) {
  return {
    resource_id: resourceId,
    user_id: userId,
    page_number: chunk.page_number,
    chunk_index: chunk.chunk_index,
    char_start: chunk.char_start,
    char_end: chunk.char_end,
    content: chunk.content,
    token_count: chunk.token_count,
  };
}
