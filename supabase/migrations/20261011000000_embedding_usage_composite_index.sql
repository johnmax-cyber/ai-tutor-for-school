-- Phase 10: composite index for embedding usage dashboard query pattern.
--
-- The dashboard query in lib/usage/analytics.ts (fetchEmbeddingUsageRows) filters
-- by user_id, then created_at >= since, and orders by created_at. The existing
-- single-column indexes on (user_id) and (created_at) are suboptimal for this
-- range-scan + sort pattern; this composite index lets Postgres satisfy the
-- filter and ordering from a single index scan.
--
-- Owner applies this by hand (npm run db push / supabase db push is NOT used
-- per project conventions).
create index if not exists idx_embedding_usage_log_user_created
  on public.embedding_usage_log (user_id, created_at);
