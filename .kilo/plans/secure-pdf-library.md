# Plan: Secure PDF Library (Phase 2)

`AI_STUDY_AGENT_MASTER_PLAN.md` Phase 2. No AI/RAG/embeddings/memory/automation/agent work. n8n MCP verified & untouched.

## Baseline confirmed (read-only inspection)
Next.js 16.3.8 / React 19 / TS / Tailwind / ESLint / App Router. Supabase SSR clients (`lib/supabase/{client,server,proxy}.ts`) + root `proxy.ts` middleware are present. Remote `resources` table (RLS on, owner policies), private `study-pdfs` bucket (PDF, 25 MB). `.env.local` holds URL + publishable key only (no service-role key). Repo has **no commits** (working tree only).

## 0. Status of this plan vs. working tree
A first cut of this exact design is already in the working tree and passes `lint`, `typecheck`, `test:pdf`, `test:validation`, and a clean `next build`. This document is the reviewed spec to be committed before deploy. No source changes are required beyond what is listed below (refinements only).

## 1. Proposed file changes
New (working tree):
- `lib/documents/pdf.ts` — `extractPdfText()` (pdfjs-dist legacy build).
- `lib/resources/types.ts` — `Resource` / `ResourceStatus`.
- `lib/resources/validation.ts` — `validatePdf()` + `MAX_PDF_BYTES` (25 MiB).
- `lib/supabase/storage.ts` — `STORAGE_BUCKET="study-pdfs"`, `buildStoragePath(uid)` → `{bucket,objectKey,storagePath}`, `parseStoragePath()`.
- `app/api/resources/route.ts` — `GET` list + `POST` upload/process; `export const runtime = "nodejs"`.
- `app/login/page.tsx` — email/password sign-in/up (browser client).
- `app/library/page.tsx` — protected library (auth gate + document table).
- `app/page.tsx` — root redirect (`/` → `/library` if authed else `/login`).
- `components/upload-form.tsx`, `components/sign-out-button.tsx`.
- `types/pdfjs-legacy.d.ts` — ambient types for `pdfjs-dist/legacy/build/pdf`.
- `tests/pdf-extract.test.ts`, `tests/validation.test.ts`.
Modified: `package.json` (+`pdfjs-dist`; +`pdf-lib`, `tsx` devDeps; `typecheck`, `test:pdf`, `test:validation` scripts).

**Preserved (untouched):** `lib/supabase/{client,server,proxy}.ts`, `proxy.ts`, `next.config.ts`, `tsconfig.json`, `.env*`, `app/layout.tsx`, `app/globals.css`, `public/*`.

## 2. Upload architecture
Browser `POST /api/resources` (`multipart/form-data`, field `file`, client enforces `accept="application/pdf"` only as UX) → Node-runtime route handler. The client **never** sends `user_id` or a storage path. Server flow:
1. `getUser()` → reject `401` if no session.
2. `request.formData()` → `File` → `Buffer.from(await file.arrayBuffer())`.
3. `validatePdf(name, type, buffer.length, buffer)` — **authoritative** checks: `.pdf` ext, `application/pdf` MIME, `0 < size ≤ 25 MiB` (uses the **actual** buffer length, not the client-claimed `file.size`), and `%PDF-` magic bytes on the buffer (MIME is spoofable).
4. Derive ownership from session: `userId = user.id`. Build storage path **server-side**: objectKey = `<userId>/<crypto.randomUUID()>.pdf` (original filename never used → no path traversal, no cross-user folder). `storage_path` DB column = `study-pdfs/<userId>/<uuid>.pdf`.
5. `resources.insert({ user_id, title, original_filename, storage_path, mime_type, size_bytes, status:"processing" })` (RLS-bound to `auth.uid()`).
6. `supabase.storage.from("study-pdfs").upload(objectKey, buffer, {contentType:"application/pdf", upsert:false})` — anon-key client, so the bucket's folder-ownership policy enforces the user can only write their own folder.
7. `extractPdfText(buffer)` → `resources.update({extracted_text, page_count, status:"ready"})`. On extraction failure → `status:"failed"`. On storage failure → `status:"failed"` (file not stored).
8. Return final resource (re-fetch the row).

Failure semantics: a failed extraction keeps the stored PDF for retry (§49); only the DB row is marked `failed`. A failed DB update after extraction returns `202` with the row id (no data loss).

Future: signed-PUT upload so the browser writes bytes directly (server still dictates path) — reduces server bandwidth.

## 3. PDF extraction architecture
- **Package:** `pdfjs-dist@6` via the **`/legacy/build/pdf`** ESM entry — Mozilla's Node runtime build (worker-free, no Canvas, fits the Node route handler). `pdf-parse` was rejected (thin wrapper, historically unmaintained, less page control); `pdf-lib`/`pdf2json` lack robust text extraction.
- **In-handler:** `getDocument({ data: Uint8Array }).promise` → `page.getTextContent()` per page → join `str`. Page markers (`=== Page N ===`) are embedded into `extracted_text`.
- **Page metadata within the existing schema:** the provided `resources` table has `extracted_text` + `page_count` (no per-page table). The MVP preserves page info as `page_count` + page-delimited text so the future AI tutor can cite "Page 17." A later milestone can add a `resource_pages` table (master plan §5/§7).
- **Sync in-handler for MVP** (Node runtime, no Edge 50 ms/timeout). Trade-off: 25 MB PDFs can take tens of seconds; acceptable until backgrounded.
- Verified at runtime: `npm run test:pdf` (real `extractPdfText` on a generated 2-page PDF) → `pageCount=2` + both page markers + text present.

## 4. Authentication / security flow
- Auth uses the **existing** Supabase SSR clients only. The `proxy.ts` middleware (root) is the active global middleware — confirmed running per-request in dev (`proxy.ts: Xms` in traces) and annotated `proxy.ts [middleware]` in the build; the prod `middleware.js` loads the server-root chunk containing `updateSession`. The empty `middleware-manifest.json` is a Next 13+ format quirk, **not** inactivity (dev showed an empty manifest yet middleware ran). It refreshes expired access tokens server-side via `getClaims()`/`updateSession` so `getUser()` sees a valid session.
- **Authorization point:** every protected surface calls `supabase.auth.getUser()` **server-side** (route handler + `library` server component), never `getSession()`. `getUser()` verifies the JWT.
- **Ownership:** `user_id = getUser().user.id` only; never from request input (sec #5, #6). `resources` selects are `.eq("user_id", user.id)` **plus** owner RLS (defense in depth, sec #8, #10). Storage uploads use the user's anon-key session with a server-built `<userId>/…` key (sec #1, #6, #9).
- **Validation** (sec #2–#4, #1 server-side): ext + MIME + ≤25 MiB + `%PDF-` magic bytes on the real buffer.
- **Secrets** (sec #7): only URL + publishable key from env. No service-role key in client or server code. Generic error messages to clients; details to server logs.
- **Privacy** (sec #11): `study-pdfs` is private; the library only lists metadata (title/status/pages/size), never file bytes. Download, when added, will use `createSignedUrl(<short expiry>)`.

Runtime verification (unauthenticated, dev server): `GET /` → 307 → `/login`; `GET /library` → 307 → `/login`; `GET /api/resources` & `POST /api/resources` → `401 {"error":"Unauthorized."}`.

### Security verification matrix
| Requirement | Implemented as | Verified |
|---|---|---|
| 1 authed upload only | `getUser()` in `POST /api/resources` | 401 unauth |
| 2/4 server-side type+size validation | `validatePdf()` in route handler | `test:validation` + build |
| 3 ≤25 MB | `MAX_PDF_BYTES` (actual `buffer.length`) | `test:validation` |
| 5/6/9 user_id & path from session | `buildStoragePath(getUser().user.id)` | code review + 401 unauth |
| 7 no service-role key | anon/publishable only (env) | repo grep (none) |
| 8 no cross-user access | `.eq("user_id",…)` + owner RLS + bucket policy | code review + 401 unauth |
| 10 respect existing RLS | anon-key client, no policy bypass | code review |
| 11 private PDFs | private bucket, metadata-only list | code review |

## 5. Packages (already added to working tree)
- `pdfjs-dist` (runtime) — Node legacy entry; per-page text+`pageCount`. (`pdf-parse` rejected: wrapper/maintenance/supply-chain; `pdf-lib` can't extract text.)
- `pdf-lib` (dev) — generate sample PDFs for the test.
- `tsx` (dev) — run TS tests directly.
- Reuses existing `@supabase/ssr` / `@supabase/supabase-js`; no new auth/DB/storage deps.

## 6. Testing strategy (commands to review)
- `npm run test:validation` (`tsx`) — `validatePdf` accepts valid PDF, rejects bad ext/MIME/>25 MiB/bad magic/empty. **6/6 pass.**
- `npm run test:pdf` (`node --import tsx/esm`) — real `extractPdfText` on a 2-page PDF; asserts `pageCount`, page markers, page numbers. **pass.**
- `npm run typecheck` (`tsc --noEmit`) — **clean**.
- `npm run lint` — **0 errors** (1 pre-existing warning in `lib/supabase/proxy.ts:16`, unrelated).
- `npm run build` — **passes** (7 routes + middleware).
- Dev auth-gating probe above.
- (Manual next steps for the reviewer, not done here) signed-in smoke upload via the browser + verify row + storage object + `ready` status.

## 7. Edge cases / failure modes
- 25 MB extraction is slow → UX shows "Uploading…"; future = background job (n8n, §20).
- DB insert OK / storage upload fail → `status:"failed"`, no orphan access path.
- Upload OK / extraction throws (corrupt PDF) → file retained, row `failed` (retryable).
- Post-extract DB update error → `202` with row id (recoverable).
- `pdfjs` parse error on scanned/OCR PDFs → `failed` (Phase 8 will add OCR).
- Missing `resources` INSERT/SELECT RLS policies → 401 (assumed present; see #9).
- Token expiry → handled by `proxy.ts` middleware refresh (confirmed active).

## 8. Future n8n integration (NOT built/touched this milestone)
- A `processing` row + `storage_path` is the natural trigger for an n8n **"Upload processing"** workflow (§20): poll `status='processing'`, run heavy extraction/OCR/PPTX, `UPDATE status`. This decouples long work from the request.
- `storage_path`, `page_count`, `extracted_text` are schema-ready for the future Resource-ingestion + AI Tutor (§4/§10) without re-architecting storage.
- The route returns the created row id so a future webhook/workflow can target it.
- n8n MCP verified & left untouched per instruction.

## 9. Must preserve / dependencies requiring a decision
- **Must preserve:** all existing Supabase clients, `proxy.ts`, `next.config.ts`, `tsconfig.json`, env files, schemas, bucket, RLS/storage policies. Do **not** rename `proxy.ts` to `middleware.ts` unless the reviewer confirms the current middleware does not refresh tokens in prod (dev confirms it runs; do not redesign speculatively).
- **Open dependency (blocker for full e2e):** an **authenticated session** against the remote Supabase could not be obtained in this session — no service-role key is exposed, no test credentials exist, and `signUp` is rate-limited/blocked by this project's custom auth email regex. Therefore owner-scoped `INSERT`/`SELECT` and the `study-pdfs` write were **not** exercised against the live remote; the secure logic is verified structurally + via the unauthenticated-boundary 401s + extraction/validation runtime tests. **No credentials were invented.** To close it: obtain a test user (or a server-only service-role key kept out of the build) and run a signed-in upload, then confirm the row + private object + `ready` status. (This is the only item requiring external state; nothing code-side is missing.)

## Next milestone (Phase 3, not built here)
Background PDF processing pipeline (chunking, a `resource_pages` table), signed-URL download/stream for content display, and OCR/scan + PPTX/DOCX via n8n — once authenticated E2E is unlocked.
