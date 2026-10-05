import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ResourceChunk } from "@/lib/resources/types";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

interface SearchParams {
  q: string;
  page: number | null;
  limit: number;
}

function parseSearchParams(searchParams: URLSearchParams): SearchParams {
  const q = searchParams.get("q");
  const pageStr = searchParams.get("page");
  const limitStr = searchParams.get("limit");

  let page: number | null = null;
  if (pageStr !== null) {
    const parsed = parseInt(pageStr, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      page = parsed;
    }
  }

  let limit = DEFAULT_LIMIT;
  if (limitStr !== null) {
    const parsed = parseInt(limitStr, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  return { q: q ?? "", page, limit };
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) {
    return jsonError("Unauthorized.", 401);
  }

  const { id: resourceId } = await params;
  if (!resourceId) {
    return jsonError("Resource id is required.", 400);
  }

  const url = new URL(request.url);
  const { q, page, limit } = parseSearchParams(url.searchParams);

  if (!q || q.trim().length === 0) {
    return jsonError("Query parameter 'q' is required.", 400);
  }

  let query = supabase
    .from("resource_chunks")
    .select("id, resource_id, user_id, page_number, chunk_index, char_start, char_end, content, token_count, created_at, updated_at")
    .eq("resource_id", resourceId)
    .textSearch("document", q, { type: "plain", config: "simple" })
    .order("page_number", { ascending: true })
    .order("char_start", { ascending: true })
    .limit(limit);

  if (page !== null) {
    query = query.eq("page_number", page);
  }

  const { data, error } = await query;

  if (error) {
    console.error("chunks search error:", error.message);
    return jsonError("Failed to search chunks.", 500);
  }

  const chunks: ResourceChunk[] = (data ?? []) as ResourceChunk[];

  return NextResponse.json({
    chunks,
    query: q,
    page: page ?? undefined,
    result_count: chunks.length,
  });
}
