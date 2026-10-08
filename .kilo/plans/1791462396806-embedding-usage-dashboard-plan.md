# Phase 10: Embedding Usage Dashboard Widget

Status: Planning | Builds on: Phase 9 (embeddings, embedding_usage_log)
Goal: Dashboard page summarizing embedding usage (tokens, chunks, model, status).

## Constraints (from AGENTS.md)
- Do only what this task asks. Touch only the files in the File Map.
- Logic lives in lib/usage/ (pure, testable). Page stays thin.
- Auth: supabase.auth.getUser(), redirect to /login if no user. Always filter by user_id.
- Tests follow tests/validation.test.ts style.

## Step 0: Read before writing
- Read the Phase 9 migration for embedding_usage_log. Use the ACTUAL column
  names and status values. Do not assume names.
- Read an existing page using StudyShell and copy its auth/redirect pattern.
- Report (do not fix): whether RLS select policy and a (user_id, created_at)
  index exist.

## Scope
Page at app/dashboard/page.tsx showing, for the last 30 days:
- Total tokens, total chunks, total requests (one row = one request)
- Tokens/chunks/requests by model
- Success vs error counts (unknown statuses grouped as "other")
- 7-day timeline (UTC days, zero-filled, oldest first), plain-HTML bars
  (div width as %), numbers visible next to each bar

Out of scope: cost, drill-down, date filters/toggles, export, charting
library, sidebar link.

## File Map
| File | Action |
|---|---|
| lib/usage/analytics.ts | New |
| app/dashboard/page.tsx | New |
| tests/usage-analytics.test.ts | New |
| package.json | Edit: add "test:usage-analytics" script only |

## Tasks
1. lib/usage/analytics.ts
   - fetchEmbeddingUsageRows(supabase, userId, days, now = new Date()):
     .eq("user_id") + .gte("created_at", since), ordered by created_at,
     paged with .range() in pages of 1000, hard cap 20 pages.
     Throws on any Supabase error. Returns { rows, truncated: boolean }.
   - summarizeEmbeddingUsage(rows) -> { totalTokens, totalChunks,
     totalRequests, byModel[], byStatus[] } (pure, null-safe: null counts = 0)
   - buildDailySeries(rows, days, now) -> { date: "YYYY-MM-DD", tokens,
     chunks, requests }[] zero-filled, oldest first, UTC days (pure)
   - getEmbeddingUsageSummary(supabase, userId, days = 30): one fetch,
     returns summary + 7-day series + truncated flag.
2. app/dashboard/page.tsx
   - Server component. Auth via getUser(); no user -> redirect("/login").
   - One call to getEmbeddingUsageSummary. try/catch -> error card
     (distinct from empty state).
   - Empty state when totalRequests === 0.
   - If truncated, show a small "showing most recent data only" note.
   - Cards: bg-surface-container-low border border-surface-container-high
     rounded-xl p-5; stats: grid grid-cols-2 sm:grid-cols-4 gap-4.
   - Format numbers with toLocaleString("en-US").
3. tests/usage-analytics.test.ts (pure functions, no mocks)
   - Empty rows -> all zeros, empty arrays.
   - byModel and byStatus aggregate correctly; unknown status -> "other".
   - null tokens/chunks treated as 0.
   - buildDailySeries returns exactly N entries, oldest first, zero-filled.
   - Rows at 23:59 and 00:01 UTC land on different days.
   - Row older than the window is excluded.
   - Fixed `now` passed in; never rely on the real clock.
4. Verify: npm run typecheck && npm run lint && npm run test:usage-analytics,
   then npm run build once at the end.

## Resolved questions
1. Range: 30-day summary, 7-day timeline.
2. Sidebar link: not in this phase.
