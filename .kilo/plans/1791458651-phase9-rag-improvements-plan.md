# Phase 9 — RAG Improvements: Hybrid Search with Embeddings

> **Status:** Planning
> **Builds on:** Phases 1–8 (auth, resource library, document processing & chunking, AI Tutor with retrieval, study memory, n8n automation, image/PPTX/vision support)
> **Goal:** *Tutor retrieves the most relevant information efficiently by combining keyword FTS with semantic vector search, with full fallback when embeddings are unavailable.*

Phase 8 deliberately kept keyword FTS intact so that Phase 9 can add vector search on top without breaking the existing retrieval path. This plan adds Supabase pgvector embeddings, an idempotent embed pipeline, a hybrid-ranked RPC, and an evaluation harness to compare keyword-only vs hybrid retrieval.

---

## Open Questions

**Provider is decided — pending dimension pre-flight check.**

The embeddings provider is chosen as the OpenAI-compatible Gemini endpoint (`gemini-embedding-001`). The single remaining gate is a pre-flight call confirming the endpoint returns exactly 768 values for the `dimensions` parameter. If the endpoint deviates, the migration dimension and `AI_EMBEDDING_DIMENSIONS` default must be adjusted before implementation.

| # | Question | Recommended Default |
|---|---|---|
| 1 | Embeddings provider | `gemini-embedding-001` via OpenAI-compatible Gemini endpoint |
| 2 | Confirmed embedding dimensions | `768` (subject to pre-flight check) |
| 3 | n8n backfill webhook path | `/api/webhooks/n8n/backfill-embeddings` |

No other material decisions are blocked once the pre-flight check passes.

---

## Resolved Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Embedding provider | `gemini-embedding-001` via OpenAI-compatible Gemini endpoint; same client as `chat()`/`vision()` | Provider decided; no new client library needed |
| 2 | Embedding dimensions | `768` (confirmed via pre-flight `dimensions=768` call before migration) | `gemini-embedding-001` returns 768 dims; dimension change later requires new column + full re-embed |
| 3 | Embedding env vars | `AI_EMBEDDING_MODEL` (explicit, never falls back to `AI_MODEL`), `AI_EMBEDDING_DIMENSIONS` (explicit), `AI_EMBEDDING_BASE_URL` / `AI_EMBEDDING_API_KEY` (fall back to chat vars if unset) | Unset model = FTS-only; base URL and key share defaults |
| 4 | Vector store | `resource_chunks.embedding vector(768)` via pgvector | Supabase pgvector; single table; no new table churn |
| 5 | Model/dim tracking | `embedding_model text`, `embedding_dim int` columns on `resource_chunks` | Dimension is fixed per model; enables idempotent re-embedding when model/dim changes; a later model change requires a new column or migration plus full re-embed |
| 6 | Embedding API method | Optional `embeddings(inputs: string[]): Promise<number[][]>` on `AIService` | Master plan §26 `embeddings()` method; chat provider may not offer it — method is optional |
| 7 | No local model | Cloud-only embeddings (same provider as chat); no Ollama/LocalAI | Dev laptop has ~4 GB RAM and a Celeron CPU; local models are infeasible |
| 8 | Idempotency / dedupe | Check `content_hash` + `embedding_model` + `embedding_dim` before calling API; also check `embedding IS NOT NULL` | Prevents re-embedding already embedded chunks; handles Phase 7 delete-and-reinsert on retry without repaid calls |
| 9 | Retry safety | Up to 3 attempts per chunk; exponential backoff 1s → 2s → 4s; honors `Retry-After`; 429/5xx → retry | Retry-safe; no paid duplicate calls on permanent errors |
| 10 | Embedding execution | Decoupled from `processResource`; resource becomes ready first; embeddings run via `embedPendingChunks(userId, resourceId?)` | Embedding is not a blocker for resource readiness; n8n backfill + optional post-upload kick |
| 11 | Error classification | 401/403/400/404 → stop job, leave chunk rows unchanged; per-chunk error (e.g., input too long) → `embedding_skipped=true`; 429/5xx → retry with backoff | Auth/config errors are job-level; only per-chunk errors mark individual rows |
| 12 | Model/dim change | Resets `embedding_skipped=false` for affected rows, triggering re-embed via backfill | Changing model or dimension must not silently skip chunks |
| 13 | [Image description] chunks | Embedded alongside text chunks; retrieved through same hybrid RPC; wrapped as untrusted `<source>` text | Phase 8 stored descriptions as chunks; Phase 9 extends them with embeddings |
| 14 | Hybrid ranking | Plain weighted Reciprocal Rank Fusion (RRF) with k=60; weight 0.0 = pure FTS, 1.0 = pure vector | Rank-based merge; no score normalization required |
| 15 | Fallback behavior | If `AI_EMBEDDING_MODEL` is unset, FTS-only path runs unchanged | System works with keyword search if embeddings are missing or provider is down |
| 16 | Batch size | 50 chunks per API call | Embedding API batch limits; cost control; matches retry unit |
| 17 | Per-resource chunk cap | Embed up to 200 chunks per resource (configurable `MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE`) | Cost guardrail; prevents runaway costs on very large documents |
| 18 | Usage logging | `embedding_usage_log` table: resource_id, chunk_count, prompt_tokens, model, status, error, created_at | Master plan §47 cost monitoring; Phase 7 webhook infra |
| 19 | Citations | `page_number` preserved in `RetrievedChunk`; hybrid RPC returns same shape as FTS-only RPC | Zero changes to `grounding.ts` citation logic |
| 20 | Privacy | Chunk text is sent to an external provider; UI notice shown when embeddings are enabled | User consent/awareness |
| 21 | Out of scope | Re-ranking, cross-encoders, late interaction (ColBERT), multi-vector representations, ANN indexes (HNSW deferred) | Keep scope tight; Phase 9 delivers working hybrid, not production-grade RAG |

---

## Quick Reference: Ordered Task List

### Stage 9A — Migration, content_hash, pure logic, AIService.embeddings

1. **Pre-flight check** — script or one-off call to the Gemini endpoint with `dimensions=768`; confirm response contains 768 floats. If not, adjust `AI_EMBEDDING_DIMENSIONS` default and migration column before proceeding.
2. **Migration** — `supabase/migrations/20261010000000_embeddings.sql`
   - `CREATE EXTENSION IF NOT EXISTS vector;`
   - `ALTER public.resource_chunks`: add `embedding vector(768)`, `embedding_model text`, `embedding_dim int`, `embedding_created_at timestamptz`, `embedding_skipped boolean not null default false`, `content_hash text`
   - No ANN index for now; exact cosine scan only. Document that HNSW is an optional later step.
   - `CREATE TABLE public.embedding_usage_log (id uuid primary key default gen_random_uuid(), resource_id uuid not null references public.resources(id) on delete cascade, user_id uuid references auth.users not null, chunk_count int not null default 0, prompt_tokens int not null default 0, model text, status text not null default 'pending', error text, created_at timestamptz not null default now())`
   - Indexes on `embedding_usage_log(resource_id)`, `embedding_usage_log(user_id)`, `embedding_usage_log(created_at)`
   - RLS policies on `embedding_usage_log` (owner-only via `user_id`)
   - Note: hybrid search functions (Stage 9C) must set `search_path = public` explicitly when using the `<=>` operator
3. **Chunk content hash** — `lib/documents/chunking.ts` or `lib/resources/types.ts`: add `computeContentHash(content: string): string` (SHA-256 hex); chunk insert includes `content_hash`
4. **Pure logic** — `lib/ai/embeddings.ts`: `getEmbeddingModelConfig()`, `shouldReembedChunk(contentHash, model, dim, embeddingModel, embeddingDim, embeddingSkipped)`, `cosineSimilarity(a, b)`, `mergeRrf(ftsResults, vectorResults, weight, limit)` — pure functions for testability
5. **Types** — `lib/ai/types.ts`: extend `EmbeddingResult` interface; add optional `embeddings(inputs: string[]): Promise<number[][]>` to `AIService`
6. **Client** — `lib/ai/client.ts`: implement `embeddings()` using OpenAI-compatible `/v1/embeddings` endpoint; reads `AI_EMBEDDING_MODEL` (must be set, no fallback to `AI_MODEL`), `AI_EMBEDDING_DIMENSIONS`, `AI_EMBEDDING_BASE_URL` (fall back to `AI_BASE_URL`), `AI_EMBEDDING_API_KEY` (fall back to `AI_API_KEY`); maps errors; logs `embedding call: model=X chunks=Y tokens=Z`
7. **Mock** — `lib/ai/mock.ts`: add `embeddings()` returning zero-vectors of the right dimension

### Stage 9B — embedPendingChunks, error handling, backfill webhook, pacing

8. **Embedding module** — `lib/resources/embeddings.ts`:
   - `embedPendingChunks(userId, resourceId?, batchSize = 50): Promise<EmbedResult>`
   - Idempotency: skip chunks where `content_hash` matches an already-embedded chunk with same `embedding_model` + `embedding_dim`; also skip `embedding_skipped=true`
   - Group remaining into batches of `batchSize`; call `ai.embeddings(texts)`
   - Error handling: 401/403/400/404 → stop the job, leave rows unchanged, return `{ status: 'failed', error }`; 429/5xx → retry up to 3 times honoring `Retry-After`; per-chunk error (e.g., input too long) → set `embedding_skipped=true`, log error
   - Store embeddings with `embedding_model`, `embedding_dim`, `embedding_created_at`; update `content_hash` if not already set
   - Enforce `MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE` (default 200); log in `embedding_usage_log`
   - Returns `{ embedded, skipped, failed, nextCursor }`
9. **Error handling policy** — `lib/resources/embeddings.ts`:
   - 401/403/400/404 from provider → stop the job without changing chunk rows; return fatal error
   - 429/5xx → retry with backoff; honor `Retry-After` header if present
   - Per-chunk error (for example input too long, provider error specific to one item) → set `embedding_skipped=true` for that chunk only
   - Changing `AI_EMBEDDING_MODEL` or `AI_EMBEDDING_DIMENSIONS` resets `embedding_skipped=false` for all chunks (only via backfill or explicit migration/script)
10. **Webhook endpoint** — `app/api/webhooks/n8n/backfill-embeddings/route.ts`:
    - Validates `N8N_WEBHOOK_SECRET` header
    - Zod body: `userId` (explicit, never `auth.uid()`), optional `resourceId`, optional `batchSize`, optional `pDailyBudget` (default 10)
    - Uses service-role Supabase client; no `auth.uid()` dependency
    - Sequential batches with a short delay between batches
    - Enforces per-day request budget: count `embedding_usage_log` rows created today for this user; stop when budget reached
    - Returns `{ embedded, skipped, failed, nextCursor, budgetRemaining }`
    - Wrap the post-upload kick in try/catch so embedding failure never marks the resource `failed`
11. **Usage log helper** — `lib/resources/embeddings.ts`: `logEmbeddingUsage(resourceId, userId, chunks, tokens, model, status, error?)` — inserts into `embedding_usage_log` (no `estimated_cost`)

### Stage 9C — Query embedding, hybrid RPCs, retrieve.ts fallback, similarity cutoff

12. **Query embedding helper** — `lib/tutor/retrieve.ts`:
    - `embedQuestion(text: string): Promise<number[] | null>` — calls `ai.embeddings([text])` when `AI_EMBEDDING_MODEL` is set; returns `null` on failure
13. **Hybrid RPC migration** — `supabase/migrations/20261010000001_hybrid_search.sql`
    - `CREATE OR REPLACE FUNCTION public.search_resource_chunks_hybrid(p_query text, p_query_embedding vector default null, p_resource_id uuid default null, p_limit int default 12, p_hybrid_weight float default 0.5, p_min_similarity float default 0.0)`
      - Runs FTS (existing logic) and vector search when `p_query_embedding IS NOT NULL`
      - FTS: same body as existing `search_resource_chunks`
      - Vector: `ORDER BY embedding <=> p_query_embedding` (cosine distance); filter by `user_id = auth.uid()`; `embedding IS NOT NULL`
      - `p_min_similarity`: filter vector results to `1 - (embedding <=> p_query_embedding) >= p_min_similarity`
      - RRF merge: plain weighted RRF with k=60; `score(item) = (1 - weight) * fts_rrf + weight * vector_rrf`
      - Returns same row shape as `search_resource_chunks` + `rank real`
      - Explicit `SET search_path = public` for the `<=>` operator
    - `CREATE OR REPLACE FUNCTION public.search_resource_chunks_by_topic_hybrid(p_topic_id uuid, p_query text default null, p_query_embedding vector default null, p_limit int default 12, p_hybrid_weight float default 0.5, p_min_similarity float default 0.0)`
      - Same pattern but filtered to topic's resources
    - Revoke/grant as existing FTS RPCs
14. **Retrieval update** — `lib/tutor/retrieve.ts`:
    - `retrieveChunks(question, resourceId)`:
      - If `AI_EMBEDDING_MODEL` is set: embed the question; if embedding succeeds, call `search_resource_chunks_hybrid` with `p_query_embedding`; if embedding fails, fall back to `search_resource_chunks` and log the fallback
      - If `AI_EMBEDDING_MODEL` is not set: call `search_resource_chunks` directly
    - `retrieveChunksForTopic(topicName, topicId)`: same pattern with topic hybrid RPC
    - Both functions return the same `RetrievedChunk[]` shape; zero changes to `grounding.ts` or `prompt.ts`

### Stage 9D — Eval script, tests, UI notice

15. **Evaluation data** — `tests/fixtures/eval-questions.json`: user-authored file with entries `{ question, expected_resource_title, expected_pages }`. **Kilo must not invent expected pages.** Add a task for the user to write at least 15 questions based on real uploaded PDFs.
16. **Evaluation script** — `scripts/eval.ts`:
    - Reads `tests/fixtures/eval-questions.json`
    - For each question: runs `retrieveChunks` in FTS-only mode and hybrid mode
    - Computes recall@5 (chunks on expected pages in top 5), MRR (reciprocal rank of first expected-page hit), grounded rate (citation validity), and `min_similarity` sweep across 0.0, 0.3, 0.5, 0.7
    - Writes a markdown report to stdout (or file path arg) comparing FTS-only vs hybrid across all metrics
    - Invoked via `npm run eval` (add script to `package.json`)
17. **Tests** — `tests/embeddings.test.ts`:
    - `getEmbeddingModelConfig()` requires explicit `AI_EMBEDDING_MODEL`; does not fall back to `AI_MODEL`
    - `shouldReembedChunk()` returns false when content_hash/model/dim match, true on change
    - `cosineSimilarity()` matches known values
    - `mergeRrf()` orders merged list correctly; weight 0.0 = pure FTS order, weight 1.0 = pure vector order
18. **Tests** — `tests/embeddings-pipeline.test.ts`:
    - `embedPendingChunks` embeds chunks with `AI_EMBEDDING_MODEL` set
    - Idempotency: content_hash + model/dim match → no API call
    - Batch size: 50-chunk batches produce correct call count
    - Retry: simulated 429 retries 3 times honoring Retry-After; simulated 400 → chunk `embedding_skipped=true`
    - Chunk cap: resource with 300 chunks → only 200 embedded
    - Backfill: webhook processes batches with delay and respects daily budget
    - Model change resets `embedding_skipped=false`
19. **Tests** — `tests/hybrid-search.test.ts`:
    - `search_resource_chunks_hybrid` with populated embeddings returns same shape as FTS
    - Fallback: when `AI_EMBEDDING_MODEL` unset or embedding fails, `retrieveChunks` calls FTS-only RPC
    - RRF merge: known FTS + vector results merge in expected order
    - `p_min_similarity` filters low-similarity vector results
20. **UI notice** — Add a small settings/library notice: *"Embeddings are enabled. Chunk text is sent to an external provider for semantic search."*
21. **Verify** — `npm run typecheck && npm run lint && npm run build`; run all new and existing test scripts

---

## Architecture / Data Flow

```
Upload
  │
  ▼
extractResource() → chunkDocument()
  │
  ▼
mark resource ready           <-- embedding decoupled from upload
  │
  ├─ optional post-upload kick (try/catch)
  │     │
  │     ▼
  │   embedPendingChunks(userId, resourceId)
  │     │
  │     ▼
  │   ai.embeddings(batch) -- retries 429/5xx
  │     │
  │     ▼
  │   logEmbeddingUsage()
  │
  └─ n8n backfill webhook (later) for remaining unembedded chunks
        │
        ▼
retrieveChunks(question)
  │
  ├─ AI_EMBEDDING_MODEL set?
  │     YES → embed question
  │     │       ├─ success → search_resource_chunks_hybrid  (FTS + vector, RRF merge)
  │     │       └─ failure → log + fall back to search_resource_chunks (FTS-only)
  │     NO  → search_resource_chunks (FTS-only, unchanged)
  ▼
buildMessages() → <source> blocks → ai.chat()
  │
  ▼
finalizeAnswer() → { answer, citations[].page_number, grounded }
```

---

## Key Algorithms

### 1. Content-hash-based idempotency

```
for each chunk:
  if chunk.content_hash = new_hash
     AND chunk.embedding IS NOT NULL
     AND chunk.embedding_model = current_model
     AND chunk.embedding_dim = current_dim:
     SKIP (already embedded correctly)
  else if chunk.embedding_skipped = true:
     SKIP (permanent failure, do not retry)
  else:
     embed and store
```

### 2. Weighted RRF merge

```
score(item) = (1 - weight) * fts_rrf(item)
           + weight * vector_rrf(item)

fts_rrf(item)     = 1 / (k + rank_in_fts_list)
vector_rrf(item)  = 1 / (k + rank_in_vector_list)

Sort descending by score; take top p_limit
```

RRF is rank-based, not score-based — it does not require normalizing FTS `ts_rank` against cosine distance. The default `k=60` means items ranked beyond 60 contribute near-zero score.

### 3. Backfill cursor

```
SELECT id, resource_id, content_hash, embedding_model, embedding_dim, embedding_skipped
 FROM public.resource_chunks
 WHERE user_id = :userId
   AND (:resourceId IS NULL OR resource_id = :resourceId)
   AND (embedding IS NULL OR embedding_model != :currentModel OR embedding_dim != :currentDim)
   AND embedding_skipped = false
 ORDER BY created_at ASC
 LIMIT :batch_size
```

Process each batch, update rows, repeat until empty. n8n orchestrates the loop across webhook calls with per-day budget enforcement.

---

## Dependencies

- **Existing and reused:** `openai` (embeddings endpoint), `@supabase/supabase-js` (pgvector via PostgREST), `zod`, `pgvector` (PostgreSQL extension via migration, no npm package).
- **New (runtime):** none.
- **New (dev):** none.

---

## Out of Scope

- Cross-encoder re-ranking (e.g., `cross-encoder/ms-marco-MiniLM-L-12-v2`) — adds latency and a local model dependency.
- Late-interaction models (ColBERT, etc.) — complex index changes.
- Multi-vector or sparse embedding representations.
- Automatic model migration (downgrade path) — manual via backfill; migration triggered when `AI_EMBEDDING_MODEL` env changes.
- Embedding generation for deleted or archived resources — they are excluded by RLS naturally.
- Long-term embedding storage cost management beyond the chunk cap.
- Multi-tenant or shared embedding indices (single-user per row design assumed).
- ANN indexes (HNSW) — deferred to a later phase; exact scan used for now.

---

## Security Considerations

| Concern | Mitigation |
|---|---|
| Embedding API key exposure | `AI_EMBEDDING_API_KEY` is server-only; never imported into `components/`; same pattern as `AI_API_KEY` and `AI_VISION_API_KEY` |
| Prompt injection via chunk text | Chunks are **data**; embedding model receives raw text but does not act on it; retrieved chunks still wrapped in `<source>` blocks at `prompt.ts:34` |
| Cross-user data leakage | Hybrid RPC filters `user_id = auth.uid()` on both FTS and vector paths; pgvector index is table-scoped; RLS enforces at row level |
| Cost abuse | `MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE` caps per-resource work; per-day request budget in backfill webhook; `embedding_usage_log` tracks usage |
| n8n webhook access | Backfill endpoint validates `N8N_WEBHOOK_SECRET` header (Phase 7 pattern); no public access |
| [Image description] chunk injection | Stored as untrusted text; wrapped in `<source>` block; system prompt already rejects commands in sources (`prompt.ts:8`) |
| Exact scan performance | No ANN index for now; acceptable for small datasets; HNSW is an optional later step |
| Vector dimension mismatch | `embedding_dim` column enforces dimension tracking; idempotency gate rejects chunks with wrong dimension; model/dim change requires explicit re-embed via backfill |
| External provider data transfer | Chunk text is sent to an external provider; UI notice shown when embeddings are enabled |

---

## Verification Checklist

- [ ] `npm run typecheck` passes with all new files
- [ ] `npm run lint` passes with all new files
- [ ] `npm run build` succeeds
- [ ] All existing tests still pass (`test:pdf`, `test:ocr`, `test:chunking`, `test:validation`, `test:tutor-*`, `test:study-*`, `test:missions`, `test:notifications`, `test:processing-retry`, `test:n8n-webhook`, `test:images`, `test:pptx`, `test:vision`, `test:prompt-injection`)
- [ ] Migration `20261010000000_embeddings.sql` applies cleanly; `CREATE EXTENSION IF NOT EXISTS vector` succeeds; pgvector columns, `content_hash`, and indexes exist
- [ ] Migration `20261010000001_hybrid_search.sql` applies cleanly; both RPCs exist with explicit `search_path = public` and `p_min_similarity` parameter
- [ ] `AI_EMBEDDING_MODEL` unset → `retrieveChunks()` calls `search_resource_chunks` (FTS-only, unchanged behavior)
- [ ] `AI_EMBEDDING_MODEL` set → `retrieveChunks()` embeds question and calls `search_resource_chunks_hybrid`
- [ ] Embedding failure in `retrieveChunks` falls back to FTS-only and logs the event
- [ ] Embedding idempotency: re-processing same resource does not re-call API for already-embedded chunks (content_hash + model/dim match)
- [ ] Chunk cap: resource with >200 chunks → only 200 embedded, rest `embedding_skipped = true`
- [ ] Retry: simulated 429 retries 3 times honoring Retry-After; simulated 400 skips chunk with `embedding_skipped = true`
- [ ] 401/403/400/404 from provider → job stops, chunk rows unchanged
- [ ] Changing `AI_EMBEDDING_MODEL` or `AI_EMBEDDING_DIMENSIONS` resets `embedding_skipped=false`
- [ ] Backfill webhook (`N8N_WEBHOOK_SECRET` header) processes batches with explicit userId and optional resourceId, delay, and daily budget
- [ ] Post-upload embedding kick wrapped in try/catch; failure does not mark resource `failed`
- [ ] Hybrid RPC returns same `RetrievedChunk[]` shape as FTS RPC; `grounding.ts` citation logic unchanged
- [ ] `[Image description]` chunks (from Phase 8) are embedded and retrieved via hybrid RPC
- [ ] `embedding_usage_log` row inserted per batch; token count correct; no `estimated_cost` column
- [ ] `npm run eval` reads `tests/fixtures/eval-questions.json` and produces a markdown report comparing FTS-only vs hybrid (recall@5, MRR, grounded rate, min_similarity sweep)
- [ ] User-authored `eval-questions.json` contains at least 15 questions with real expected pages
- [ ] UI notice appears when embeddings are enabled
- [ ] `grep -r "AI_EMBEDDING_API_KEY\|AI_EMBEDDING_MODEL" components/` shows **no** matches

---

## Phase Boundaries (vs. master plan)

- **Phase 9 (this doc):** embeddings, hybrid search, idempotent pipeline, backfill, cost guardrails, evaluation. ✓
- **Phase 10:** dashboard — embedding usage summary (token counts) feeds into a usage widget.
- **Phase 11:** full security test pass; this phase adds env-var secret checks and injection tests.
- **Master plan §37 (evaluation):** Phase 9 adds the evaluation script to actually measure keyword-only vs hybrid rather than assume hybrid is better.

---

## Test Scripts to Add to `package.json`

```json
"test:embeddings": "tsx tests/embeddings.test.ts",
"test:embeddings-pipeline": "tsx tests/embeddings-pipeline.test.ts",
"test:hybrid-search": "tsx tests/hybrid-search.test.ts",
"eval": "tsx scripts/eval.ts"
```

---

## Summary of Open Questions

| # | Question | Recommended Default |
|---|---|---|
| 1 | Embeddings provider | `gemini-embedding-001` via OpenAI-compatible Gemini endpoint |
| 2 | Confirmed embedding dimensions | `768` (subject to pre-flight `dimensions=768` check) |
| 3 | n8n backfill webhook path | `/api/webhooks/n8n/backfill-embeddings` |

The only blocking item is the pre-flight dimension check against the chosen endpoint. Once confirmed, the migration column size, `AI_EMBEDDING_DIMENSIONS` default, and client implementation are finalized.
