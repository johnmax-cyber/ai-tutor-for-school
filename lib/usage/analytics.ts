import type { SupabaseClient } from "@supabase/supabase-js";

export const SUMMARY_DAYS = 30;
export const DAILY_SERIES_DAYS = 7;
export const PAGE_SIZE = 1000;
export const MAX_PAGES = 20;

export interface EmbeddingUsageRow {
  created_at: string;
  prompt_tokens: number | null;
  chunk_count: number | null;
  model: string | null;
  status: string | null;
}

export interface ModelUsage {
  model: string;
  tokens: number;
  chunks: number;
  requests: number;
}

export interface StatusUsage {
  status: "success" | "error" | "other";
  count: number;
}

export interface UsageSummary {
  totalTokens: number;
  totalChunks: number;
  totalRequests: number;
  byModel: ModelUsage[];
  byStatus: StatusUsage[];
}

export interface DailyUsage {
  date: string;
  tokens: number;
  chunks: number;
  requests: number;
}

export interface EmbeddingUsageReport extends UsageSummary {
  series: DailyUsage[];
  truncated: boolean;
}

function toCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Fetches usage rows for one user created within the last `days` days.
 * Pages through results with .range(); stops at MAX_PAGES and reports truncation.
 * Throws on any Supabase error (details belong in server logs, not UI).
 */
export async function fetchEmbeddingUsageRows(
  supabase: SupabaseClient,
  userId: string,
  days: number,
  now: Date = new Date(),
): Promise<{ rows: EmbeddingUsageRow[]; truncated: boolean }> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows: EmbeddingUsageRow[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("embedding_usage_log")
      .select("created_at, prompt_tokens, chunk_count, model, status")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`embedding_usage_log query failed: ${error.message}`);
    }

    const pageRows = (data ?? []) as EmbeddingUsageRow[];
    rows.push(...pageRows);

    if (pageRows.length < PAGE_SIZE) {
      return { rows, truncated: false };
    }
  }

  return { rows, truncated: true };
}

/** Pure: totals, per-model and per-status breakdowns. Null counts count as 0. */
export function summarizeEmbeddingUsage(rows: EmbeddingUsageRow[]): UsageSummary {
  let totalTokens = 0;
  let totalChunks = 0;
  const models = new Map<string, ModelUsage>();
  const statuses = { success: 0, error: 0, other: 0 };

  for (const row of rows) {
    const tokens = toCount(row.prompt_tokens);
    const chunks = toCount(row.chunk_count);
    totalTokens += tokens;
    totalChunks += chunks;

    const modelName = row.model ?? "unknown";
    const entry = models.get(modelName) ?? {
      model: modelName,
      tokens: 0,
      chunks: 0,
      requests: 0,
    };
    entry.tokens += tokens;
    entry.chunks += chunks;
    entry.requests += 1;
    models.set(modelName, entry);

    if (row.status === "success" || row.status === "error") {
      statuses[row.status] += 1;
    } else {
      statuses.other += 1;
    }
  }

  return {
    totalTokens,
    totalChunks,
    totalRequests: rows.length,
    byModel: [...models.values()].sort((a, b) => b.tokens - a.tokens),
    byStatus: [
      { status: "success", count: statuses.success },
      { status: "error", count: statuses.error },
      { status: "other", count: statuses.other },
    ],
  };
}

/**
 * Pure: zero-filled per-UTC-day series of `days` entries, oldest first,
 * ending on the UTC day of `now`.
 */
export function buildDailySeries(
  rows: EmbeddingUsageRow[],
  days: number,
  now: Date = new Date(),
): DailyUsage[] {
  const buckets = new Map<string, DailyUsage>();
  const series: DailyUsage[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = toDayKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
    const bucket = { date, tokens: 0, chunks: 0, requests: 0 };
    buckets.set(date, bucket);
    series.push(bucket);
  }

  for (const row of rows) {
    const bucket = buckets.get(row.created_at.slice(0, 10));
    if (!bucket) continue;
    bucket.tokens += toCount(row.prompt_tokens);
    bucket.chunks += toCount(row.chunk_count);
    bucket.requests += 1;
  }

  return series;
}

/** One query for the user's rows; returns 30-day summary plus 7-day series. */
export async function getEmbeddingUsageSummary(
  supabase: SupabaseClient,
  userId: string,
  days: number = SUMMARY_DAYS,
  now: Date = new Date(),
): Promise<EmbeddingUsageReport> {
  const { rows, truncated } = await fetchEmbeddingUsageRows(supabase, userId, days, now);
  return {
    ...summarizeEmbeddingUsage(rows),
    series: buildDailySeries(rows, DAILY_SERIES_DAYS, now),
    truncated,
  };
}
