# Phase 8 — Image and Advanced Document Support

> **Status:** Planning
> **Builds on:** Phase 1–6 (auth, resource library, PDF extraction + OCR fallback, AI Tutor chat/retrieval, Study Sessions/Attempts/Mistakes, analytics) and Phase 7 (n8n automation, `processResource()` extraction, webhook retry, missions, notifications)
> **Goal:** *The system can learn from richer study materials — uploaded images, slides, and diagrams — not just text PDFs.*

This plan picks up where the master plan §1245–1257 leaves off. **Scanned-PDF OCR is already shipped** in `lib/documents/ocr.ts` + `lib/documents/pdf.ts` (`isScannedPdf → performOcr → ocrToExtractedDocument`). Phase 8 therefore *extends* the pipeline rather than re-implementing OCR: it adds **standalone image ingestion**, **PPTX processing**, **vision-based diagram understanding**, and **query-time vision Q&A**, all wired through the existing chunking → `resource_chunks` → retrieval flow.

---

## Resolved Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Scope | Image (PNG/JPG) OCR + ingest, PPTX text/notes/images, vision diagram descriptions, tutor image Q&A | Master plan §8–9; scanned-PDF OCR already done in Phase 3 |
| 2 | File-type dispatch | New `extractResource(data, mimeType) → ProcessingOutput` dispatcher in `lib/documents/extract.ts` replaces the hard-coded `extractPdfText` call inside `processResource()` | Keeps a single processing pipeline; **Phase 7 retry webhook updated** to enforce retry gates (`retry_count`, `processing_started_at`) |
| 3 | Image OCR engine | `tesseract.js` worker (already a dep) recognizes PNG/JPG directly — no pdfjs render needed | Reuses installed, tested stack; `eng.traineddata` already in repo root |
| 4 | PPTX extraction | `pizzip` (new, tiny OSS dep) to read the OOXML zip; custom XML text extractor for `ppt/slides/slideN.xml` + `ppt/notesSlides/noteSlideN.xml`; page_number = slide number | Avoids a system `libreoffice`/`pandoc` dependency; works in the Node runtime already used by `extractPdfText` |
| 5 | PPTX images | Embedded slide images extracted to a typed buffer; each stored via `resource_images` row + described by the vision model (when enabled) stored as a chunk | Makes diagrams searchable via existing FTS; keeps original image available for query-time vision |
| 6 | Vision model | `AI_VISION_MODEL` env var (optional); falls back to `AI_MODEL` when set and `VISION_DIAGRAMS_ENABLED=true` | Cost-control (§27/§47): vision calls are paid, so they are opt-in; ingest OCR stays local/free via tesseract |
| 7 | Vision interface | Add `vision(text, imageBase64, mimeType) → VisionResult` to the existing `AIService` abstraction in `lib/ai/types.ts`; implement in `lib/ai/client.ts` with the OpenAI-compatible `image_url` payload | Reuses `createAIService()` + `mapProviderError`; keeps AI behind the provider wall (§26) |
| 8 | Diagram descriptions | Ingest-time vision description written **as a `resource_chunks` row** (page = source page) so existing `search_resource_chunks` retrieval grounds diagram content without RPC changes; same text is mirrored into `resource_images.vision_description` | Zero-touch retrieval; no new RPC needed for Phase 8 |
| 9 | Query-time vision Q&A | `POST /api/tutor` accepts optional `image` (base64 + mime) or `imageResourceId` + `imagePage`; when present and vision enabled, tutor builds a vision message (image + retrieved text chunks + question) | Fulfills master plan §8 "answer questions about the image, connect to study material" |
| 10 | Storage | Reuse the existing private `study-pdfs` bucket for all file types (binary-agnostic); `buildObjectPath` gains an extension param; object key keeps the real extension | No new bucket/policy churn; preserves existing upload/processing paths |
| 11 | Standalone image Q&A | For `image/*` resources, query-time vision re-downloads the resource object from storage by `(resourceId, page)`; no `resource_images` row required | Minimal schema — the resource object *is* the image |
| 12 | DOCX | **Deferred** (PPTX covers slides; DOCX would need `mammoth`). Out of scope for Phase 8. | Scope discipline; master plan lists DOCX as "future" |
| 13 | TXT/Markdown | Supported through the same dispatcher; detected by extension/mime; extracted as plain text, chunked identically | Zero new parser; reuses `chunkDocument` and FTS |
| 14 | Retry safety | `processResource` tracks `processing_started_at` + `retry_count`; webhook gives up after 3 attempts; never retries permanent failures (unsupported type, corrupt, validation) or resources started <10 min ago | Prevents infinite loops on bad files; respects in-flight processing |

---

## Quick Reference: Ordered Task List (staged)

### Stage 8A — Core pipeline, image OCR, text/MD, retry safety
1. **Migration** — `supabase/migrations/20261009000000_resource_images.sql`
   - `ALTER resources`: add `ocr_used`, `ocr_confidence`, `processing_metadata`, `retry_count`, `processing_started_at`
   - Create `resource_images` table (`image_index`, unique on `resource_id, page_number, image_index`) + RLS + indexes
2. **Resource types** — `lib/documents/types.ts`: `ResourceType` (pdf|image|pptx|text), `IMAGE_MIME_TYPES`, `PPTX_MIME_TYPE`, `MAX_IMAGE_BYTES`, `MAX_PPTX_BYTES`, `detectResourceType()`
3. **Image extraction** — `lib/documents/images.ts`: `extractImageText()` (downscale ≤2000px, strip EXIF via canvas, tesseract)
4. **Text/MD extraction** — `lib/documents/text.ts`: `extractText()` (UTF-8 decode, single page)
5. **Extraction dispatcher** — `lib/documents/extract.ts`: `extractResource()` dispatching pdf|image|pptx|text
6. **Validation** — `lib/resources/validation.ts`: `validateImage`, `validatePptx` (zip + `[Content_Types].xml`), `validateText`, `validateResource()` dispatcher
7. **Refactor processing + retry safety** — `lib/resources/processing.ts`: `processResource()` calls `extractResource()`; stores metadata; retry gate (`retry_count>=3`, `processing_started_at < 10min`, permanent failures no retry); `ProcessResult` gains `imagesInserted`
8. **Storage helper** — `lib/supabase/storage.ts`: `buildObjectPath(userId, ext)`, `buildStoragePath`, `getSignedResourceUrl`
9. **Resource types (lib)** — `lib/resources/types.ts`: `ResourceImage`, `toImageInsert()`, extend `Resource` with new columns
10. **Upload API** — `app/api/resources/route.ts`: use `validateResource`, real `mime_type`, ext-aware path, dispatch `processResource`
11. **Config** — `.env.example` add `AI_VISION_MODEL`, `AI_VISION_BASE_URL`, `AI_VISION_API_KEY`, `VISION_DIAGRAMS_ENABLED`, `MAX_VISION_IMAGES_PER_RESOURCE`; `package.json` add `pizzip` + `test:images`/`test:text`/`test:processing-types` scripts
12. **Tests 8A** — `tests/images.test.ts`, `tests/text.test.ts`, `tests/processing-types.test.ts`, `tests/processing-images.test.ts` (retry safety)

### Stage 8B — PPTX extraction
13. **PPTX extraction** — `lib/documents/pptx.ts`: `extractPptxText()` (pizzip; presentation.xml `sldIdLst` order; slide `.rels` for notes; media via relationships; zip limits: entries/uncompressed/per-entry)
14. **Tests 8B** — `tests/pptx.test.ts` (pizzip-built fixtures; real fixtures in `tests/fixtures/` skip if absent)

### Stage 8C — Vision, prompt-injection tests
15. **AI vision interface** — `lib/ai/types.ts`: optional `vision()` + `VisionResult`; `lib/ai/client.ts` implement (separate vision env vars; model-can't-accept-images → clear error); `lib/ai/mock.ts` implement
16. **Vision description** — `lib/documents/vision.ts`: `describeImage()` (re-encode, dedupe by SHA-256, min size, cap `MAX_VISION_IMAGES_PER_RESOURCE`, sequential calls, partial failure → warnings in metadata, resource stays `ready`)
17. **Processing vision integration** — `lib/resources/processing.ts`: when `VISION_DIAGRAMS_ENABLED`, call `describeImage` on extracted images → chunk + `resource_images` row
18. **Prompt-injection tests** — `tests/prompt-injection.test.ts`: slide text, speaker notes, OCR text, `[Image description]` chunk with `"ignore previous instructions"` all treated as data; retrieval wraps in `<source>` blocks

### Stage 8D — Tutor vision Q&A, UI
19. **Tutor vision API** — `app/api/tutor/route.ts`: zod schema `imageResourceId` + `imagePage` only (no base64); vision configured → 200 grounded answer; unconfigured → 503; base64 body → 400
20. **Library UI** — `app/library/page.tsx`: file-type icons (PDF/image/slides/text), status chips, page/slide count (thumbnails deferred)
21. **Upload UI** — `components/upload-form.tsx`: `accept=".pdf,.png,.jpg,.jpeg,.pptx,.txt,.md"`; type-aware hints; loader
22. **Tutor image attach** — `components/tutor-chat.tsx`: image-clip button (resource picker modal), preview, disabled when vision unavailable, **alt text + keyboard access**
23. **Vision notice** — tutor chat banner: *"This image will be sent to an external AI provider for analysis."*
24. **Config (update)** — add test scripts for 8B/8C/8D
25. **Tests 8D** — `tests/tutor-vision.test.ts`, `tests/vision.test.ts`
26. **Verify** — `npm run typecheck && lint && build`, all test scripts (new + existing)

---

## Architecture / Data Flow

```
Browser (library / tutor)
  │  POST /api/resources {file}                     POST /api/tutor {question, imageResourceId?, imagePage?}
  ▼                                                 ▲
app/api/resources/route.ts                         app/api/tutor/route.ts
  │ getUser() → 401, ownership                      │ getUser() → 401
  │ validateResource()  (pdf|image|pptx|text)       │ retrieveChunks() (text grounding)
  │ store to study-pdfs (ext-aware path)            │ if imageResourceId && vision enabled:
  │ processResource()  ──► lib/resources/processing │   re-download image bytes from storage
  └─► lib/documents/extract.ts dispatch             │   ai.vision(text+image+question)
       ├─ images.ts (downscale ≤2000px, strip EXIF, tesseract)  merge citations, finalizeAnswer()
       ├─ pptx.ts   (pizzip: presentation.xml order; slide .rels for notes)  └─► { answer, citations, model }
       ├─ pdf.ts    (pdfjs + OCR fallback, exists)
       ├─ text.ts   (UTF-8 decode)
       └─ vision.ts (optional diagram describe)
           │
           ├─ chunkDocument() → resource_chunks  (FTS-searchable, page=slide/page)
           ├─ resource_images  (image bytes ref + description, query-time vision)
           └─ resources: ocr_used, ocr_confidence, processing_metadata, retry_count, processing_started_at
```

Key invariants preserved:
- **Single pipeline.** `processResource()` is the only entry point; the retry webhook (`app/api/webhooks/n8n/retry-processing/route.ts`) works unchanged because `ProcessResult` is a superset. **Phase 7 webhook updated** to respect `retry_count` and `processing_started_at` gates.
- **Retrieval unchanged.** Vision descriptions are stored as `resource_chunks`, so `search_resource_chunks` / `search_resource_chunks_by_topic` (Phase 4 migrations) ground diagram content with zero RPC edits. Stored `[Image description]` chunks are wrapped as untrusted `<source>` blocks at retrieval.
- **Provider wall.** `AIService.vision()` is implemented in `lib/ai/client.ts` only; vision never touches client components.
- **Secrets.** New env vars (`AI_VISION_MODEL`, `AI_VISION_BASE_URL`, `AI_VISION_API_KEY`) are server-only; never imported into `components/`.

---

## Data Model Additions

### Migration: `supabase/migrations/20261009000000_resource_images.sql`

```sql
-- Enrich the resource row with OCR / vision / metadata (additive; existing columns preserved)
alter table public.resources
  add column if not exists ocr_used boolean not null default false,
  add column if not exists ocr_confidence double precision,
  add column if not exists processing_metadata jsonb,
  add column if not exists retry_count int not null default 0,
  add column if not exists processing_started_at timestamptz;

-- Extracted/embedded images with optional vision description (for query-time vision + previews)
create table if not exists public.resource_images (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  page_number int not null,
  image_index int not null default 0,
  storage_path text not null,     -- object key within study-pdfs bucket
  mime_type text not null,
  vision_description text,         -- ingest-time vision caption (also mirrored as a chunk)
  vision_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_images_resource_page_idx_unique unique (resource_id, page_number, image_index)
);

alter table public.resource_images enable row level security;
create policy "read own resource_images" on public.resource_images for select using (auth.uid() = user_id);
create policy "manage own resource_images" on public.resource_images for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index idx_resource_images_resource on public.resource_images (resource_id);
create index idx_resource_images_user on public.resource_images (user_id);
```

**RLS:** the five new columns on `resources` are covered by existing owner-only policies. `resource_images` gets owner-only policies matching `resource_chunks`.

---

## Processing Pipeline Generalization

### `lib/documents/extract.ts` (new dispatcher)

```ts
export interface ProcessImage {
  storagePath: string;      // object key within study-pdfs
  mimeType: string;
  pageNumber: number;
  imageIndex: number;
}

export interface ProcessingOutput {
  document: ExtractedDocument;
  images: ProcessImage[];            // for resource_images rows
  metadata: Record<string, unknown>;  // ocr_used, ocr_confidence, slide_count, ...
  sourceKind: "pdf" | "image" | "pptx" | "text";
}

export async function extractResource(
  data: Uint8Array,
  mimeType: string,
  filename: string,
  ai?: AIService,
  opts?: { visionDiagramsEnabled?: boolean },
): Promise<ProcessingOutput>
```

- `application/pdf` → `extractPdfText` (existing; keeps OCR fallback).
- `image/*` → `extractImageText` (downscale to ≤2000px long edge via canvas, strip EXIF by re-encoding, then tesseract on the raster directly).
- `application/vnd.openxmlformats-officedocument.presentationml.presentation` → `extractPptxText` (pizzip slides + notes; pull `ppt/media/*` images).
- `text/plain`, `text/markdown` → `extractText` (decode UTF-8, single page).
- Anything else → reject with a short error (no generic fallthrough).

`processResource()` calls `extractResource()`, then chunks, verifies coverage, and — **only if `VISION_DIAGRAMS_ENABLED` and `ai` provided** — describes each `ProcessImage` via `describeImage()`, stores the caption as a chunk *and* a `resource_images` row. **Retry safety:** on entry, if `retry_count >= 3` or `processing_started_at > now() - interval '10 minutes'`, return `{ success: false, status: 'failed', error: 'Retry limit exceeded or processing too recent' }`. Permanent failures (unsupported type, corrupt file magic, validation error) increment `retry_count` but do **not** schedule retry; they mark the resource `failed` immediately. `ProcessResult` gains optional `imagesInserted?: number`.

---

## Library Modules (pure, testable)

### `lib/documents/types.ts` (new)
```ts
export type ResourceType = "pdf" | "image" | "pptx";
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg"] as const;
export const PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;   // 10 MB
export const MAX_PPTX_BYTES = 50 * 1024 * 1024;    // 50 MB

export function detectResourceType(filename, mimeType, size): { type: ResourceType; error?: string }
```

### `lib/documents/images.ts` (new)
- `extractImageText(data, mimeType): Promise<ExtractedDocument>` — reuses the module-level tesseract worker from `ocr.ts`. Single page (`pageNumber = 1`, `page_count` not incremented in chunks). Returns `ocrUsed=true` + confidence on the `ExtractedDocument`.

### `lib/documents/pptx.ts` (new)
- `extractPptxText(data): Promise<{ document: ExtractedDocument; images: ProcessImage[] }>`
- **Validation before parsing:** zip must contain `[Content_Types].xml` with a `ppt/` override; reject otherwise. Zip limits: `MAX_ZIP_ENTRIES=500`, `MAX_ZIP_UNCOMPRESSED=100 MB`, `MAX_ENTRY_UNCOMPRESSED=25 MB` — checked before reading any entry.
- **Slide order:** read `ppt/presentation.xml` → `sldIdLst`; resolve each `r:id` through `ppt/_rels/presentation.xml.rels` to get the slide part path; iterate in that order. Do **not** rely on `slideN.xml` numbering.
- **Speaker notes:** for each slide, read its `.rels` (e.g., `ppt/slides/_rels/slide1.xml.rels`) to find the `notesSlide` target; extract text from that `notesSlide.xml`.
- **Embedded images:** collect `ppt/media/*` entries referenced by slide relationships; store each as a `ProcessImage` (page = slide order index, imageIndex = sequential per slide).
- slide number = `pageNumber` (1-based in presentation order).

### `lib/documents/vision.ts` (new)
```ts
export interface VisionOpts { model?: string; purpose?: "diagram" | "question"; maxTokens?: number; }
export async function describeImage(
  data: Uint8Array, mimeType: string, ai: AIService, opts?: VisionOpts
): Promise<string>
```
- **Pre-vision:** re-encode image via canvas to strip EXIF; downscale to ≤2000px long edge (same as OCR path). Skip images under `MIN_IMAGE_PIXELS` (e.g., 64×64). Dedupe by SHA-256 hash of re-encoded bytes; cap at `MAX_VISION_IMAGES_PER_RESOURCE` (default 10).
- Calls `ai.vision()` **sequentially** with a **data-only** prompt ("Describe this educational diagram/screenshot as a concise study note…").
- **Partial failure:** if any vision call fails, log warning, store successful descriptions, mark resource `ready`, append `{ vision_warnings: [{ imageIndex, error }] }` to `processing_metadata`. Never mark `failed` due to vision alone.

### `lib/ai/types.ts` (extend)
```ts
export interface VisionResult { text: string; model: string; promptTokens: number; completionTokens: number; }
export interface AIService {
  chat(messages: ChatMessage[]): Promise<AIResult>;
  vision?(text: string, imageBase64: string, mimeType: string): Promise<VisionResult>;  // optional
  getCallLog?(): unknown[];
  getCallCount?(): number;
}
```
`vision` stays optional so `lib/ai/mock.ts` can implement it for tests; real client implements when `AI_VISION_MODEL || AI_MODEL` is set.

### `lib/ai/client.ts` (vision implementation)
- Uses `AI_VISION_MODEL` (or `AI_MODEL`), `AI_VISION_BASE_URL` (or `AI_BASE_URL`), `AI_VISION_API_KEY` (or `AI_API_KEY`).
- If vision enabled but provider returns "model does not support images" (or 400 with that meaning), throw a short `AIError("bad_request", "Vision model does not accept images")` → surfaces as 400 in tutor, 500 in processing with warning.
- Logs `vision` calls with model, tokens, latency (same format as `chat`).

### `lib/resources/validation.ts` (extend)
- `validateImage(filename, mime, size, buffer)`: ext ∈ {.png,.jpg,.jpeg}, mime image/*, ≤ MAX_IMAGE_BYTES, magic bytes `\x89PNG` / `\xFF\xD8\xFF`.
- `validatePptx(filename, mime, size, buffer)`: ext `.pptx`, correct mime, ≤ MAX_PPTX_BYTES, zip contains `[Content_Types].xml` with `ppt/` override (not just `PK\x03\x04`).
- `validateText(filename, mime, size, buffer)`: ext ∈ {.txt,.md}, mime text/*, ≤ 5 MB, valid UTF-8.
- `validateResource(file: File): ResourceValidation` dispatcher returning `{ type, ok, error }`.

### `lib/supabase/storage.ts` (extend)
- `buildObjectPath(userId, ext = "pdf")`
- `buildStoragePath(userId, ext)`
- `getSignedResourceUrl(supabase, storagePath, expiresInSec = 60)` — for private image/PPTX previews.

### `lib/resources/types.ts` (extend)
- Add `ResourceImage`, `toImageInsert(image, resourceId, userId)`.
- Extend `Resource` with optional `ocr_used`, `ocr_confidence`, `processing_metadata`, `retry_count`, `processing_started_at` (additive; safe to ignore if absent in older rows).

---

## API Additions

### `POST /api/resources` (generalized upload)
- Auth: `getUser()` → 401; ownership implicit (uses session user id).
- `validateResource(file)` → `{ type, ok, error }`. Reject unknown types with short `error`.
- Store real `mime_type` (not hardcoded `application/pdf`); extension-aware `storage_path`.
- `processResource()` dispatch by type.
- Returns created `resource` (same shape as before).

### `POST /api/tutor` (vision Q&A)
- Request zod gains optional: `imageResourceId: uuid`, `imagePage: int`. **No raw base64 body** — client must upload the image first via `/api/resources`, then reference it.
- Flow when `imageResourceId` present **and** vision configured (`AI_VISION_MODEL` set):
  1. Re-download the resource object from storage by `(imageResourceId, imagePage)`; verify ownership.
  2. `retrieveChunks(question, resourceId)` for text grounding (unchanged).
  3. `ai.vision(buildVisionPrompt(question, chunks, visionDesc), imageBase64, mimeType)`.
  4. Merge retrieved-chunk citations with the vision answer via `finalizeGrounding()`.
- When `imageResourceId` present but vision not configured → `503 "Vision model not configured."`.
- `export const maxDuration = 60` (already set).

> **Note on grounding for images:** For standalone image resources, the OCR chunks already make the image's text retrievable, so non-vision questions still ground. Vision is only invoked when the *client explicitly references an uploaded image resource*.

---

## UI Additions

- `app/library/page.tsx`: file-type icon (PDF/image/slides/text), status chips (`processing`/`ready`/`failed`), page/slide count. **Thumbnails deferred to Phase 8.5** (optional).
- `components/upload-form.tsx`: `accept=".pdf,.png,.jpg,.jpeg,.pptx,.txt,.md"`; type-aware hint text; loader `"Processing & analyzing…"`.
- `components/tutor-chat.tsx`: image-clip button in the input bar (opens resource picker modal), attachment preview thumbnail, **disabled state when vision unavailable** (`AI_VISION_MODEL` absent), **alt text and full keyboard access** for all new controls.
- **Vision notice:** a non-intrusive banner in tutor chat when vision is used: *"This image will be sent to an external AI provider for analysis."*
- `app/resources/[id]/page.tsx` (new, **deferred to Phase 8.5 — optional**): resource header, image/PPTX-page preview gallery, extracted text view, topic-assignment UI.

---

## Key Algorithms

### 1. Resource type dispatch (`extractResource`)
```
switch mimeType:
  pdf           → extractPdfText  (existing OCR fallback)
  image/png|jpg → extractImageText (downscale ≤2000px, strip EXIF, tesseract, page=1)
  pptx          → extractPptxText (pizzip: presentation.xml sldIdLst order; slide .rels for notes; media via relationships)
  text/plain|md → extractText (UTF-8 decode, single page)
  default       → throw "unsupported file type"
```

### 2. Diagram description (ingest-time, opt-in)
```
if VISION_DIAGRAMS_ENABLED and ai.vision available:
  candidates = output.images
  dedupe by SHA-256 of re-encoded bytes; skip if < MIN_IMAGE_PIXELS
  take first MAX_VISION_IMAGES_PER_RESOURCE (default 10)
  for each candidate sequentially:
    try:
      description = await describeImage(imageBytes, mime, ai, {purpose:'diagram'})
      chunk = { ...chunkPageText(description, page, ...), content: "[Image description] " + description }
      insert resource_images row { storagePath, mime, vision_description, vision_model }
    catch err:
      append { imageIndex, error: err.message } to processing_metadata.vision_warnings
  if any vision_warnings: resource stays "ready" with warnings in metadata
```

### 3. Tutor vision grounding (query-time)
```
imageBytes = downloadObject(imageResourceId, imagePage)  // ownership verified
chunks = retrieveChunks(question, resourceId)            // text context
visionPrompt = VISION_PROMPT + sources(chunks) + "Question: " + question
visionText = await ai.vision(visionPrompt, toBase64(imageBytes), mime)
answer = finalizeAnswer(parseGrounded(visionText), visionText, chunks, visionModel)
```
Vision answers cite the text chunks (`[N]`) where possible; the vision text itself is treated as the answer body, with `grounded` true only when text citations exist.

### 4. Cost guardrails
- `VISION_DIAGRAMS_ENABLED` gates ingest-time vision.
- Image Q&A returns `503` when `AI_VISION_MODEL` is unset — never silently calls the text model with an image.
- Cost counters: vision calls logged via `AIResult.promptTokens/completionTokens` (same format as `chat`).
- `MAX_VISION_IMAGES_PER_RESOURCE` (default 10) + min size + dedupe cap ingest vision calls.

---

## Dependencies

- **Existing & reused:** `tesseract.js`, `canvas`, `pdfjs-dist`, `@supabase/supabase-js`, `openai`, `zod`, `pdf-lib` (dev, tests), `tsx` (dev, tests).
- **New (runtime):** `pizzip` (read PPTX zip). Pure JS, tiny, no system deps.
- **New (dev):** none (pizzip is covered by `test:pptx` via pizzip-built PPTX buffers; vision mocked).
- **No new npm packages** for image OCR (tesseract already present) or vision (OpenAI client already present).

---

## Out of Scope

- DOCX extraction (would need `mammoth`; deferred).
- Embeddings / vector DB (Phase 9).
- Query-time vision for images *embedded inside PDF/PPTX* that were not extracted to `resource_images` (only extracted images + standalone image resources get query-time vision).
- Local vision models (Ollama Gemma/GPT-4V — Phase "optional local model").
- Mobile app / voice / offline.
- PowerPoint *export/creation* — read-only ingestion.
- **Phase 8.5 (later):** images inside PDFs — render low-text PDF pages to canvas and send to vision; PDF embedded image extraction; library thumbnails; resource detail page.

## Security Considerations

| Concern | Mitigation |
|---|---|
| Malicious image upload | `validateImage` magic-byte + size check; stored in private `study-pdfs` bucket; never served to other users |
| Malicious PPTX / zip-bomb | `validatePptx` checks `[Content_Types].xml` + ≤50 MB + zip limits (entries/uncompressed/per-entry); pizzip has zip-slip guards; extraction only in `os.tmpdir` with prefix |
| Vision prompt injection via image OCR | OCR text stored as **data**; vision `describeImage` prompt treats the image as data, not instructions; tutor system prompt already rejects commands inside `<source>`; **stored `[Image description]` chunks wrapped as untrusted source text at retrieval time** |
| Vision token cost abuse | `VISION_DIAGRAMS_ENABLED` gates ingest vision; query-time vision returns 503 when `AI_VISION_MODEL` unset; `MAX_VISION_IMAGES_PER_RESOURCE` caps ingest calls |
| Secrets exposure | `AI_VISION_MODEL`, `AI_VISION_BASE_URL`, `AI_VISION_API_KEY` env are server-only; never imported into `components/`; grep check scoped to `components/` only |
| Cross-user image access | `resource_images` RLS owner-only; tutor re-download gated by `resources` ownership check (existing pattern) |
| Private image previews | `getSignedResourceUrl` uses time-limited signed URLs, not public URLs |
| EXIF / metadata leakage | Images re-encoded via canvas before OCR/vision, stripping EXIF; original stored unchanged |

---

## Testing Strategy

### Unit tests (no DB, no live vision)
| Test file | Tests |
|---|---|
| `tests/images.test.ts` | `extractImageText` on synthetic PNG (via `canvas`) returns page 1 + text; downscale ≤2000px; EXIF stripped; `validateImage` rejects bad ext/mime/oversized/wrong magic |
| `tests/pptx.test.ts` | `extractPptxText` reads slide text + speaker notes from a **pizzip-built** PPTX buffer; slide order from `presentation.xml`; notes from slide `.rels`; rejects non-PPTX zip (missing `[Content_Types].xml`); zip limits enforced |
| `tests/vision.test.ts` | `describeImage` with `createMockAI` calls `vision` once; prompt contains `[Image description]` data framing, not instructions; dedupe/hash/skip-small tested |
| `tests/processing-types.test.ts` | `extractResource` dispatches pdf↔image↔pptx↔text by mime; unsupported mime throws short error |
| `tests/prompt-injection.test.ts` | Slide text, speaker notes, OCR text, and stored `[Image description]` chunk containing `"ignore previous instructions"` are all treated as **data**; retrieval wraps them in `<source>` blocks; model never follows embedded commands |

### Integration tests (mock Supabase + mock AI)
| Test file | Tests |
|---|---|
| `tests/processing-images.test.ts` | `processResource(imageResource)` → chunks inserted, `ocr_used=true`, `resource_images` row created when vision enabled; retry safety: `retry_count>=3` fails, `processing_started_at < 10min` fails, permanent failures not retried |
| `tests/tutor-vision.test.ts` | `POST /api/tutor` with `imageResourceId` + vision configured → 200 + grounded answer; vision unconfigured → 503; raw base64 body rejected |

> **Fixtures:** real PowerPoint/Google Slides/LibreOffice exports go in `tests/fixtures/`. Tests using them `skip()` with a clear message if the file is absent. Synthetic PNGs built with `canvas`; synthetic PPTX built with `pizzip` in test setup. `pdf-lib` cannot make either.

### Test scripts to add to `package.json`
```json
"test:images": "tsx tests/images.test.ts",
"test:pptx": "tsx tests/pptx.test.ts",
"test:vision": "tsx tests/vision.test.ts",
"test:processing-types": "tsx tests/processing-types.test.ts",
"test:prompt-injection": "tsx tests/prompt-injection.test.ts",
"test:processing-images": "tsx tests/processing-images.test.ts",
"test:tutor-vision": "tsx tests/tutor-vision.test.ts"
```

---

## Verification Checklist

- [ ] `npm run typecheck` passes with all new files
- [ ] `npm run lint` passes with all new files
- [ ] `npm run build` succeeds
- [ ] `npm run test:images` passes
- [ ] `npm run test:pptx` passes
- [ ] `npm run test:vision` passes
- [ ] `npm run test:processing-types` passes
- [ ] `npm run test:prompt-injection` passes
- [ ] `npm run test:processing-images` passes
- [ ] `npm run test:tutor-vision` passes
- [ ] All existing tests still pass (`test:pdf`, `test:ocr`, `test:validation`, `test:chunking`, `test:e2e`, `test:tutor-*`, `test:study-*`, `test:missions`, `test:notifications`, `test:processing-retry`, `test:n8n-webhook`)
- [ ] `POST /api/resources` with a PNG → stores `image/png`, OCRs, status `ready`
- [ ] `POST /api/resources` with a PPTX → stores `pptx` mime, extracts slides + notes (presentation.xml order), status `ready`
- [ ] `POST /api/resources` with `.exe` / bad magic → 400
- [ ] `POST /api/resources` with `.txt` / `.md` → stores `text/plain`, chunks, status `ready`
- [ ] `POST /api/tutor` with `imageResourceId` (vision configured) → returns vision-grounded answer
- [ ] `POST /api/tutor` with `imageResourceId` (vision unconfigured) → 503
- [ ] `POST /api/tutor` with raw base64 `image` body → 400
- [ ] Ingest-time diagram description chunk is retrievable via `GET /api/resources/:id/search?q=…`
- [ ] Retry safety: resource with `retry_count=3` → failed; resource started <10min ago → not retried; permanent failure → no retry scheduled
- [ ] `grep -r "AI_VISION_MODEL\|VISION_DIAGRAMS_ENABLED\|SUPABASE_SERVICE_ROLE_KEY" components/` shows **no** matches (env server-only)
- [ ] `grep -r "image_url" lib/ components/` only in `lib/ai/client.ts`
- [ ] Library page shows file-type icon; tutor bar shows image-clip button with alt text/keyboard access
- [ ] Vision notice banner appears in tutor when vision is used

---

## Phase Boundaries (vs. master plan)

- **Phase 8 (this doc):** image ingestion, PPTX, vision diagrams, tutor image Q&A, TXT/MD, retry safety. ✓
- **Phase 8.5 (later):** images inside PDFs — render low-text PDF pages to canvas and send to vision; PDF embedded image extraction; library thumbnails; resource detail page.
- **Phase 9 RAG:** embeddings + vector search — Phase 8 deliberately keeps keyword FTS so Phase 9 can swap the retriever without touching extraction.
- **Phase 10 Dashboard:** progress viz.
- **Phase 11 Security:** Phase 8 adds file-type-specific validation + vision token caps + zip limits + prompt-injection tests; full security test pass is Phase 11.

---

## Summary of Changes from Previous Draft

| Area | Change |
|------|--------|
| **resource_images table** | Added `image_index int not null default 0`; unique constraint now `(resource_id, page_number, image_index)`; removed `width`/`height`; removed `cover_image_path` from `resources`; added `retry_count int not null default 0` and `processing_started_at timestamptz` to `resources`. |
| **PPTX extraction** | Slide order from `ppt/presentation.xml` `sldIdLst` resolved via `ppt/_rels/presentation.xml.rels`; speaker notes via each slide's `.rels`; validation requires `[Content_Types].xml` with `ppt/` override; zip limits (max entries, max uncompressed, max per-entry) enforced before parsing. |
| **Retry safety** | `processResource` gates: `retry_count >= 3` → fail; `processing_started_at < 10 min ago` → fail; permanent failures (unsupported type, corrupt, validation) never retried. Phase 7 webhook (`app/api/webhooks/n8n/retry-processing/route.ts`) and n8n workflow updated accordingly. |
| **Vision config** | Added optional `AI_VISION_BASE_URL`, `AI_VISION_API_KEY`; if vision enabled but model rejects images → clear short error. `MAX_VISION_IMAGES_PER_RESOURCE` (default 10); skip images under min size; dedupe by SHA-256; sequential calls; partial failure leaves resource `ready` with warnings in `processing_metadata`. |
| **Tutor image Q&A** | Removed raw base64 body; only `imageResourceId` + `imagePage`; unconfigured vision → `503` (not 501). |
| **Image preprocessing** | Downscale to ≤2000px long edge via canvas; megapixel limit; strip EXIF by re-encoding before OCR/vision. |
| **UI** | Vision notice banner in tutor; alt text + keyboard access for new controls; library thumbnails and resource detail page deferred to Phase 8.5 (optional). |
| **TXT/MD support** | Added through same dispatcher; detected by extension/mime; extracted as plain text. |
| **Prompt-injection tests** | Added for slide text, speaker notes, OCR text, stored `[Image description]` chunk with `"ignore previous instructions"`; stored descriptions wrapped as untrusted `<source>` at retrieval. |
| **Test fixtures** | PPTX built with `pizzip`, PNG with `canvas` in tests; real fixtures in `tests/fixtures/` skip with clear message if absent. |
| **Verification** | Grep check for secrets scoped to `components/` only. |
| **Task list** | Restructured into 4 stages: 8A (core + image OCR + text/MD + retry safety), 8B (PPTX), 8C (vision + injection tests), 8D (tutor vision Q&A + UI). |
