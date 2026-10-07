# Phase 7 — n8n Automation

> **Status:** Planning
> **Builds on:** Phases 1-6 (auth, resource library, PDF processing, AI Tutor, Study sessions, analytics)
> **Goal:** *Repetitive work becomes automated.*

---

## Resolved Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | n8n hosting | Local Docker Compose (n8n + worker) | Matches local-dev-only constraint (AGENTS.md §1); n8n workflows version-controlled as JSON |
| 2 | n8n ↔ Supabase | Direct REST API via HTTP nodes, service_role key | n8n needs cross-user reads/writes for scheduled jobs; RLS bypass via service_role is appropriate for a trusted background worker |
| 3 | n8n ↔ Next.js | Webhook endpoints with shared secret (`N8N_WEBHOOK_SECRET` header) | No user session available; webhook secret is the standard n8n↔app auth pattern |
| 4 | Notification delivery | In-app notifications table (email is a stretch goal) | Web app with no SMTP configured; in-app is zero-dependency and testable |
| 5 | Processing retry | n8n polls DB, calls `/api/webhooks/n8n/retry-processing` webhook | Keeps PDF/processing logic in `lib/documents/` + `lib/resources/` (app-side), n8n only orchestrates |
| 6 | Mission creation | n8n calls `/api/webhooks/n8n/generate-daily-mission` webhook | Mission selection logic lives in `lib/missions/generation.ts` (pure, testable) |
| 7 | Weekly summary | n8n calls `/api/webhooks/n8n/generate-weekly-summary` webhook | AI call must happen server-side in `app/api/` (AGENTS.md §4); endpoint uses existing `lib/ai/client.ts` |
| 8 | Processing logic | Extract `processResource()` from `app/api/resources/route.ts` into `lib/resources/processing.ts` | Both the upload endpoint and retry webhook share the same pipeline |
| 9 | User preferences | New `user_preferences` table (one row per user) | Configures reminder time, feature toggles per user (master plan §40) |
| 10 | n8n data dir | `n8n/` (gitignored) holds SQLite DB + credentials | Workflows JSON tracked in git; runtime data is ephemeral |

---

## Quick Reference: Ordered Task List

1. **Migration** — `supabase/migrations/20261008000000_n8n_automation.sql` (3 tables + indexes + RLS)
2. **Processing extraction** — `lib/resources/processing.ts` (extract `processResource()` from API route)
3. **Processing endpoint refactor** — `app/api/resources/route.ts` (use extracted `processResource()`)
4. **Notification types** — `lib/notifications/types.ts`
5. **Notification service** — `lib/notifications/service.ts` (`createManyForUser`, `markRead`, `listForUser`)
6. **Mission types** — `lib/missions/types.ts`
7. **Mission generation (pure)** — `lib/missions/generation.ts` (`selectReviewTopics`, `generateDailyMission`, `generateWeeklySummaryPrompt`)
8. **Mission service** — `lib/missions/service.ts` (`createMission`, `listForUser`, `completeMission`)
9. **Webhook utilities** — `lib/automation/auth.ts` (`validateN8nWebhook`, `createServiceSupabase`)
10. **Webhook API routes:**
    - `app/api/webhooks/n8n/retry-processing/route.ts`
    - `app/api/webhooks/n8n/reminder-notification/route.ts`
    - `app/api/webhooks/n8n/generate-daily-mission/route.ts`
    - `app/api/webhooks/n8n/generate-weekly-summary/route.ts`
11. **AI summary module** — `lib/tutor/summary.ts` (`generateSummary()`)
12. **User-facing API routes:**
    - `app/api/notifications/route.ts` (GET list, POST create)
    - `app/api/notifications/[id]/read/route.ts` (POST mark read)
    - `app/api/missions/route.ts` (GET list, POST create)
    - `app/api/missions/[id]/complete/route.ts` (POST)
    - `app/api/preferences/route.ts` (GET, PATCH)
12. **Docker Compose** — `docker-compose.yml` (Next.js + n8n + n8n worker)
13. **n8n workflows** (JSON):
    - `n8n/workflows/study-reminder.json`
    - `n8n/workflows/daily-mission.json`
    - `n8n/workflows/weekly-review.json`
    - `n8n/workflows/processing-retry.json`
14. **UI additions:**
    - `components/notifications-popover.tsx`
    - `app/settings/page.tsx` (preference editor)
    - Update `components/study-shell.tsx` (add notifications bell)
    - Update `app/study/page.tsx` (show missions card)
15. **Tests:**
    - `tests/missions.test.ts`
    - `tests/notifications.test.ts`
    - `tests/n8n-webhook.test.ts`
    - `tests/processing-retry.test.ts`
16. **Config updates:** `.env.example` (add env vars), `.gitignore` (add n8n runtime), `package.json` (add test scripts)
17. **Verify** — typecheck, lint, build, all tests (new + existing)

---

## Architecture / Data Flow

```
┌─────────────────┐    CRON/poll    ┌──────────┐    webhook (secret)    ┌──────────────────┐
│      n8n        │ ─────────────→  │  Supabase│ ──→ query tables       │  Next.js API     │
│  (docker)       │                 │  (SRK)   │                        │  (app/api/webhooks)│
├─────────────────┤                 └──────────┘                        │  validate secret │
│ CRON:  study-   │                      │                              │  processRetry()  │
│ reminder        │              read/update tables                     │  extractPdfText()│
│ every day 9 AM   │                      │                              │  chunkDocument() │
├─────────────────┤                      ▼                              │  update resource │
│ CRON: daily-    │                 ┌────────────┐                     │  update status   │
│ mission         │                 │ resources  │                     │  create notif    │
│ every day 8 AM   │                 │ study_    │                     └────────┬─────────┘
├─────────────────┤                 │ sessions  │                              │
│ CRON: weekly-   │                 │ topics     │                              ▼
│ review          │                 │ mistakes   │                     ┌──────────────────┐
│ every Monday    │                 │ notifi-    │                     │  notifications   │
│ 8 AM            │                 │ cations    │                     │  table (user sees │
├─────────────────┤                 │ study_     │  ←─────────────────  │  in UI)         │
│ CRON: proc-     │                 │ missions   │                      └──────────────────┘
│ essing-retry    │                 │ user_     │                              │
│ every 5 min      │                 │ preferences│                     ┌──────────────────┐
└─────────────────┘                 └────────────┘                      │  missions table  │
                                                                             │  (user clicks   │
                                                                             │  → study page)  │
                                                                             └──────────────────┘
```

n8n is a **scheduler and orchestrator only**. All processing logic, AI calls, and business rules stay in the Next.js app. n8n's job is:
- Trigger workflows via cron
- Query Supabase (service_role key, bypasses RLS)
- Iterate over rows (SplitInBatches)
- Call webhook endpoints to execute logic
- (Stretch) Send emails via SMTP node

---

## Data Model Additions

### New migration: `supabase/migrations/20261008000000_n8n_automation.sql`

```sql
-- In-app notifications (delivered by n8n workflows)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null check (type in ('reminder','mission','summary','processing_complete')),
  title text not null,
  message text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Daily/weekly missions created by n8n
create table if not exists public.study_missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  type text not null check (type in ('daily_review','weekly_summary')),
  topic_id uuid references public.topics(id) on delete set null,
  title text not null,
  description text,
  scheduled_for date not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Per-user automation preferences
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users on delete cascade,
  study_reminders_enabled boolean not null default true,
  reminder_time time not null default '09:00:00',
  daily_mission_enabled boolean not null default true,
  weekly_summary_enabled boolean not null default true,
  processing_retry_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
```

**Indexes:**
```sql
create index idx_notifications_user on public.notifications (user_id);
create index idx_notifications_unread on public.notifications (user_id) where read_at is null;
create index idx_notifications_created on public.notifications (created_at desc);
create index idx_missions_user on public.study_missions (user_id);
create index idx_missions_scheduled on public.study_missions (scheduled_for desc);
create index idx_missions_pending on public.study_missions (user_id, completed) where completed = false;
```

**RLS:** All three tables get owner-only policies (`auth.uid() = user_id` for select; same with `with check` for all mutations).

---

## n8n Infrastructure

### docker-compose.yml

```yaml
name: ai-study-agent
services:
  web:
    build: .
    ports: ["3000:3000"]
    env_file: [".env.local"]
  n8n:
    image: docker.n8n.io/n8nio/n8n
    ports: ["5678:5678"]
    env_file: [".env.local"]
    environment:
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_BASIC_AUTH_USER}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD}
    volumes:
      - ./n8n:/home/node/.n8n
      - ./n8n/workflows:/workflows
    depends_on: [web]
  n8n-worker:
    image: docker.n8n.io/n8nio/n8n
    command: worker
    env_file: [".env.local"]
    environment:
      - N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}
    volumes:
      - ./n8n:/home/node/.n8n
    depends_on: [n8n]
```

### Environment variables (`.env.example` additions)

```
# n8n Automation
N8N_WEBHOOK_SECRET=                # shared secret for webhook validation
N8N_ENCRYPTION_KEY=               # n8n credential encryption key
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=changeme
SUPABASE_SERVICE_ROLE_KEY=        # used by n8n and webhook endpoints only
```

### n8N config file: `n8n/n8n.config.js`

Sets `load` from `n8n/workflows/*.json` so workflows auto-import on startup.

---

## n8n Workflow Definitions

### 1. Processing Retry (`processing-retry.json`)

**Trigger:** CRON — every 5 minutes  
**Filter condition:** `processing_retry_enabled = true` for the user

Flow:
1. **Supabase HTTP node** — `GET /rest/v1/resources?status=in.processing,failed&updated_at=lt.{5min ago}`
2. **SplitInBatches** — iterate users
3. **HTTP Request node** — `POST {APP_URL}/api/webhooks/n8n/retry-processing` with body `{ resourceId, userId }`, header `x-n8n-webhook-secret`
4. **IF node** — if response status != 200, create a notification for that user about processing failure

### 2. Study Reminder (`study-reminder.json`)

**Trigger:** CRON — daily at midnight (checks user preference times)  
**Filter condition:** `study_reminders_enabled = true`

Flow:
1. **Supabase HTTP node** — `GET /rest/v1/topics?or=next_review_at.lte.{now}(),(next_review_at.is.false)` — finds topics needing review
2. **SplitInBatches** — iterate users (distinct)
3. **IF node** — check if user has had a study session today (query `study_sessions` for today)
4. If NO session today → **HTTP Request node** — `POST /api/webhooks/n8n/reminder-notification` with `{ userId, topicsCount }`
5. The webhook endpoint creates notifications in the `notifications` table

### 3. Daily Mission (`daily-mission.json`)

**Trigger:** CRON — daily at 8 AM  
**Filter condition:** `daily_mission_enabled = true`

Flow:
1. **Supabase HTTP node** — `GET /rest/v1/topics?next_review_at.lte.{now()}` — find topics needing review
2. **SplitInBatches** — iterate users
3. **HTTP Request node** — `POST {APP_URL}/api/webhooks/n8n/generate-daily-mission` with `{ userId }`, header `x-n8n-webhook-secret`
4. The endpoint selects topics via `lib/missions/generation.ts`, creates a `study_mission` row, and creates a notification

### 4. Weekly Review (`weekly-review.json`)

**Trigger:** CRON — every Monday at 8 AM  
**Filter condition:** `weekly_summary_enabled = true`

Flow:
1. **Supabase HTTP node** — `GET /rest/v1/study_sessions?gte.{7days ago}&status=eq.completed` — find recent sessions  
2. **SplitInBatches** — iterate users (distinct)
3. **HTTP Request node** — `POST {APP_URL}/api/webhooks/n8n/generate-weekly-summary` with `{ userId }`, header `x-n8n-webhook-secret`
4. The endpoint queries past-week data, calls AI to generate a summary, creates a notification

---

## Processing Retry Extraction

### `lib/resources/processing.ts` (new)

Extracts the PDF → chunks → DB update pipeline from `app/api/resources/route.ts`:

```typescript
export interface ProcessResult {
  success: boolean;
  status: "ready" | "failed";
  error?: string;
  resource?: Resource;
}

export async function processResource(
  resourceId: string,
  supabase: SupabaseClient
): Promise<ProcessResult>
```

Single function handles the full pipeline:
1. Fetch `resource` row by id (includes `storage_path`, `user_id`, `original_filename`)
2. Parse `storage_path` via `parseStoragePath()` → `{ bucket, objectKey }`
3. Download from storage: `supabase.storage.from(bucket).download(objectKey)` → `Buffer`
4. `extractPdfText(buffer)` → `ExtractedDocument`
5. `chunkDocument(doc.pages)` → `PageChunk[]`
6. `verifyDocumentCoverage()` for validation
7. Delete old chunks (`resource_chunks.delete().eq("resource_id", resourceId)`)
8. Insert new chunks via `toChunkInsert()` for each
9. Update resource: `status='ready'`, `extracted_text`, `page_count`, `char_count`

**Error handling:** On any step failure, catch and update `status='failed'`, `error_message=<short message>`, log full error server-side. Return `{ success: false, error }`.

**Refactor `app/api/resources/route.ts`:** Replace inline processing (lines 109-192) with a single call to `processResource(resourceId, supabase)` after the file upload succeeds. The POST handler creates the resource row with `status='processing'`, uploads to storage, then calls `processResource()`.

### `lib/missions/types.ts` (updated with summary type)

```typescript
export type MissionType = "daily_review" | "weekly_summary";

export interface StudyMission { /* ... */ }

export interface MissionInput { /* ... */ }

// Used by weekly summary workflow
export interface WeeklySessionSummary {
  sessionId: string;
  topicName: string;
  subjectName: string | null;
  accuracy: number;
  totalAttempts: number;
  correctAttempts: number;
  hintsUsed: number;
  durationMinutes: number | null;
}
```

---

## Library Modules (pure, testable)

### `lib/notifications/types.ts`

```typescript
export type NotificationType = "reminder" | "mission" | "summary" | "processing_complete";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationInput {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
}
```

### `lib/notifications/service.ts`

```typescript
export class NotificationService {
  constructor(private supabase?: SupabaseClient) {}
  async listForUser(userId: string, opts?: { unreadOnly?: boolean; limit?: number }): Promise<Notification[]>
  async create(input: NotificationInput | NotificationInput[]): Promise<void>
  async markRead(notificationId: string, userId: string): Promise<void>
  async markAllRead(userId: string): Promise<void>
  async deleteNotification(notificationId: string, userId: string): Promise<void>
  async unreadCount(userId: string): Promise<number>
}
```

**Design:** Uses dependency injection like `StudySessionService` — tests inject a mock Supabase client.

### `lib/missions/types.ts`

```typescript
export type MissionType = "daily_review" | "weekly_summary";

export interface StudyMission {
  id: string;
  user_id: string;
  type: MissionType;
  topic_id: string | null;
  title: string;
  description: string | null;
  scheduled_for: string;
  completed: boolean;
  created_at: string;
}

export interface MissionInput {
  user_id: string;
  type: MissionType;
  topic_id?: string | null;
  title: string;
  description?: string | null;
  scheduled_for: string;
}
```

### `lib/missions/generation.ts` (pure functions)

```typescript
// Select topics that need review (next_review_at <= now, has resources)
export function selectReviewTopics(
  topics: Topic[],
  now: Date = new Date()
): Topic[]

// Pick the best topic for today's mission (prioritizes review_needed > learning > developing)
export function selectDailyMissionTopic(topics: Topic[]): Topic | null

// Generate a mission title + description from a topic
export function generateDailyMission(topic: Topic): { title: string; description: string }

// Build the AI prompt for weekly summary generation
export function buildWeeklySummaryPrompt(sessions: WeeklySessionSummary[]): string
```

**Selection priority for daily mission topic:**
1. `review_needed` topics (highest priority)
2. `learning` topics (next priority)
3. `developing` topics (fallback)
4. Topics sorted by: urgency (`next_review_at`), then mastery state priority, then `last_studied` (oldest first)

### `lib/missions/service.ts`

```typescript
export class MissionService {
  constructor(private supabase?: SupabaseClient) {}
  async listForUser(userId: string, opts?: { completed?: boolean }): Promise<StudyMission[]>
  async create(input: MissionInput): Promise<StudyMission>
  async completeMission(missionId: string, userId: string): Promise<void>
}
```

### `lib/automation/auth.ts`

```typescript
export function validateN8nWebhook(request: Request): { valid: boolean }

export function createServiceSupabase(): SupabaseClient
```

- `validateN8nWebhook` — reads `x-n8n-webhook-secret` header from request, compares to `N8N_WEBHOOK_SECRET` env var using `timingSafeEqual`. Returns `{ valid: true }` or `{ valid: false }`. Does **not** parse the body (body is parsed separately by each route handler with zod).
- `createServiceSupabase` — creates a Supabase client with the service_role key (`SUPABASE_SERVICE_ROLE_KEY` env var) using `@supabase/supabase-js` `createClient`. All webhook endpoints use this for cross-user access (bypasses RLS). The `userId` comes from the validated request body, not from auth, and is validated against the database on each call.

### `lib/tutor/summary.ts` (new — AI summary generation)

```typescript
const SUMMARY_PROMPT = `You are a study coach. ...`;

export async function generateSummary(
  sessions: WeeklySessionSummary[],
  ai: AIService
): Promise<SummaryResult>

export interface SummaryResult {
  text: string;
  topicFocus: string[];
  strengths: string[];
  weaknesses: string[];
}
```

Uses the same retry/parse pattern as `lib/tutor/generate.ts` — calls `ai.chat()`, parses JSON or falls back to raw text. The AI call stays in `app/api/` (route handler constructs `AIService` via `createAIService()`), the prompt + parse logic is in `lib/tutor/`.

---

## Webhook API Endpoints (n8n → Next.js)

All use `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`.

### `app/api/webhooks/n8n/retry-processing/route.ts`

- **Auth:** Webhook secret validation
- **Body (zod):** `{ resourceId: z.string().uuid() }`
- **Flow:**
  1. `createServiceSupabase()` (service_role key)
  2. Fetch resource, verify status is `processing` or `failed`
  3. Call `processResource(resourceId, supabase)` from `lib/resources/processing.ts`
  4. Return `{ success, status, error? }`

### `app/api/webhooks/n8n/generate-daily-mission/route.ts`

- **Auth:** Webhook secret validation
- **Body (zod):** `{ userId: z.string().uuid() }`
- **Flow:**
  1. `createServiceSupabase()`
  2. Fetch user's topics with resources (join `topics`, `resources_topics`, `resources`)
  3. Call `selectReviewTopics()` → `selectDailyMissionTopic()` → `generateDailyMission()`
  4. Create `study_mission` row via `MissionService.create()`
  5. Create notification via `NotificationService.create()`
  6. Return `{ missionCreated: boolean }`

### `app/api/webhooks/n8n/generate-weekly-summary/route.ts`

- **Auth:** Webhook secret validation
- **Body (zod):** `{ userId: z.string().uuid() }`
- **Flow:**
  1. `createServiceSupabase()`
  2. Query user's completed sessions from past 7 days + attempts + topics
  3. Build summary data (`WeeklySessionSummary[]`)
   4. Call `generateSummary(sessions, createAIService())` from `lib/tutor/summary.ts`
   5. Create notification with AI-generated summary text (title: "Weekly Summary")
   6. Return `{ summaryText, notificationId }`

### `app/api/webhooks/n8n/reminder-notification/route.ts`

- **Auth:** Webhook secret validation
- **Body (zod):** `{ userId: z.string().uuid(), topicsCount: number }`
- **Flow:**
  1. `createServiceSupabase()`
  2. Look up user's `user_preferences` to check `study_reminders_enabled`
  3. Create a reminder notification: title `"Review Reminder"`, message `"{topicsCount} topics are ready for review. Continue your study streak."`, link `/study`
  4. Return `{ notificationCreated: boolean }`

---

## User-Facing API Routes

### `app/api/notifications/route.ts`

| Method | Auth | Body | Response |
|---|---|---|---|
| GET | `getUser()` → 401, ownership filter | — | `{ notifications: Notification[] }` |
| POST | `getUser()` → 401 | `{ type, title, message, link? }` (zod) | `{ success: true }` |

### `app/api/notifications/[id]/read/route.ts`

| Method | Auth | Body | Response |
|---|---|---|---|
| POST | `getUser()` → 401, ownership check | — | `{ success: true }` |

### `app/api/missions/route.ts`

| Method | Auth | Body | Response |
|---|---|---|---|
| GET | `getUser()` → 401 | — | `{ missions: StudyMission[] }` |
| POST | `getUser()` → 401 | `{ title, type, scheduled_for }` (zod) | `{ mission: StudyMission }` |

### `app/api/missions/[id]/complete/route.ts`

| Method | Auth | Body | Response |
|---|---|---|---|
| POST | `getUser()` → 401, ownership check | — | `{ success: true }` |

### `app/api/preferences/route.ts`

| Method | Auth | Body | Response |
|---|---|---|---|
| GET | `getUser()` → 401 | — | `{ preferences: UserPreferences }` |
| PATCH | `getUser()` → 401 | `{ study_reminders_enabled?, reminder_time?, daily_mission_enabled?, weekly_summary_enabled?, processing_retry_enabled? }` (zod) | `{ preferences: UserPreferences }` |

---

## UI Additions

### `components/notifications-popover.tsx` (new, client component)

- Fetches `GET /api/notifications?unreadOnly=true` on interval
- Bell icon in header with unread count badge
- Dropdown shows 10 most recent notifications
- Click notification → navigate to `link` (if provided) + mark read
- "Mark all read" button
- Uses `createClient()` from `lib/supabase/client.ts` (browser client)

### `app/settings/page.tsx` (new, server component → wrapped in client component for form)

- Auth gate (`getUser()`, redirect to `/login` if not authenticated)
- Preference toggles: daily reminder, daily mission, weekly summary, processing retry
- Time picker for reminder time
- Uses `StudyShell` layout
- Form POSTs to `PATCH /api/preferences`

### Updated: `components/study-shell.tsx`

- Add notifications bell icon in header (replaces the placeholder person icon area)
- Notifications popover opens on click

### Updated: `app/study/page.tsx`

- Add "Today's Mission" card above "Active Sessions"
- Fetches `GET /api/missions?completed=false`
- Shows mission title + description
- "Start Study Session" button links to `/study/new?topicId={mission.topic_id}`

---

## Key Algorithms

### 1. Daily mission topic selection

```
topics = all user topics with ready resources
reviewTopics = topics.filter(t => t.next_review_at <= now && t.mastery_state != "not_started")

if reviewTopics empty:
    return null (no mission today)

sort by priority:
  1. mastery_state === "review_needed"  (highest)
  2. mastery_state === "learning"
  3. mastery_state === "developing"
  then by next_review_at ascending (most overdue first)
  then by last_studied ascending (oldest first)

return first topic
```

### 2. Processing retry detection

```
n8n queries: resources where status IN ('processing','failed')
  AND updated_at < now() - 5 minutes

For each resource:
  call POST /api/webhooks/n8n/retry-processing { resourceId }
  
Endpoint re-runs the full pipeline:
  download from storage → extractPdfText → chunkDocument → insert chunks → update status
```

### 3. Weekly summary data collection

```
n8n queries: study_sessions where status='completed' AND ended_at >= now() - 7 days

For each user with completed sessions:
  call POST /api/webhooks/n8n/generate-weekly-summary { userId }
  
Endpoint:
  query sessions + attempts + topics for past 7 days
  build prompt: "Summarize these study sessions: ..."
  call AI → get summary text
  create notification with summary
```

---

## Dependencies

- Phases 1-6 (all existing infrastructure)
- n8n Docker image (Docker Desktop required for local dev)
- `SUPABASE_SERVICE_ROLE_KEY` (new env var — must be added to remote Supabase project)
- No new npm packages needed (n8n runs in Docker, not in the Next.js app)

---

## Out of Scope

- Email delivery (SMTP node included in n8n but disabled by default; requires SMTP config)
- Push notifications / browser push
- Mobile app
- Local AI models
- n8n cloud/hosted deployment (local Docker only)
- Real-time notifications (polling every 30s from client — stretch goal uses Supabase Realtime)
- Complex mission scheduling (multiple tasks per mission; MVP is single topic per mission)
- n8n UI customization / custom nodes

---

## Security Considerations

| Concern | Mitigation |
|---|---|
| **Webhook secret exposure** | `N8N_WEBHOOK_SECRET` is server-side only; never sent to browser |
| **Service role key leakage** | `SUPABASE_SERVICE_ROLE_KEY` only in `lib/automation/auth.ts` + Docker env; never in components/ |
| **Cross-user data access** | Webhook endpoints receive `userId` from n8n body, not from client session; service_role key bypasses RLS but the userId is validated against existing records |
| **n8n config file** | `n8n/n8n.config.js` and workflows are tracked in git; credentials stored in `n8n/` (gitignored) |
| **Resource processing** | Retry only processes resources owned by the specified user; resource_id + user_id verified |
| **AI in webhook** | Summary AI only reads data for the specified user; no cross-user leakage |

---

## Testing Strategy

### Unit tests (no DB, no API key)

| Test file | Tests |
|---|---|
| `tests/missions.test.ts` | `selectReviewTopics()` filters by review date; `selectDailyMissionTopic()` priority ordering; `generateDailyMission()` title/description format |
| `tests/notifications.test.ts` | `NotificationService` creates/marks-read/lists; `unreadCount()` accuracy; ownership enforcement in mock |
| `tests/n8n-webhook.test.ts` | `validateN8nWebhook()` accepts valid secret; rejects missing/wrong secret; `createServiceSupabase()` returns client with service role |
| `tests/processing-retry.test.ts` | `processResource()` success path (mock PDF + chunks); failure path (marks failed); extracts reusable pipeline |

### Integration tests (live Supabase + mock AI)

| Test file | Tests |
|---|---|
| `tests/e2e-n8n.test.ts` | Unauthenticated webhook → 401/invalid; valid webhook secret → processes resource; generates daily mission for user with review topics; generates weekly summary for user with past sessions |

### Test scripts to add to `package.json`

```json
"test:missions": "tsx tests/missions.test.ts",
"test:notifications": "tsx tests/notifications.test.ts",
"test:n8n-webhook": "tsx tests/n8n-webhook.test.ts",
"test:processing-retry": "tsx tests/processing-retry.test.ts",
"test:e2e-n8n": "tsx tests/e2e-n8n.test.ts"
```

### Verification Checklist

- [ ] `npm run typecheck` passes with all new files
- [ ] `npm run lint` passes with all new files
- [ ] `npm run build` succeeds
- [ ] `npm run test:missions` passes
- [ ] `npm run test:notifications` passes
- [ ] `npm run test:n8n-webhook` passes
- [ ] `npm run test:processing-retry` passes
- [ ] All existing tests still pass
- [ ] `docker-compose up -d` starts n8n + app without errors
- [ ] n8n imports all 4 workflow JSON files on startup
- [ ] `POST /api/webhooks/n8n/retry-processing` with wrong secret → 401
- [ ] `POST /api/webhooks/n8n/retry-processing` with valid secret → processes resource
- [ ] `POST /api/webhooks/n8n/generate-daily-mission` creates mission + notification for user with review topics
- [ ] `POST /api/webhooks/n8n/generate-weekly-summary` creates summary notification for user with past-week sessions
- [ ] Browser: notifications popover shows unread count + marks read on click
- [ ] Browser: `/settings` page shows preference toggles
- [ ] Browser: study hub shows "Today's Mission" card when missions exist
- [ ] Browser: past sessions show notifications in dropdown
- [ ] `grep -r "SUPABASE_SERVICE_ROLE_KEY" app/ components/` only shows imports in `lib/automation/auth.ts` and webhook route handlers (not client components)
- [ ] `grep -r "N8N_WEBHOOK_SECRET" app/ components/` only shows server-side route handlers (not client components)