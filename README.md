AI Tutor for School — a Next.js app where students upload study PDFs and ask questions grounded in their own documents.

Run: npm run dev (requires .env.local with Supabase + AI keys)

Env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, AI_API_KEY, AI_BASE_URL, AI_MODEL

Test: npm run typecheck && npm run lint && npm run test:pdf && npm run test:validation && npm run test:chunking && npm run test:e2e

---

## Phase 7 — n8n Automation (local)

Automation (daily missions, weekly summaries, study reminders, processing retry) runs from a single n8n container. The Next.js app stays on the host; n8n reaches it at `http://host.docker.internal:3000`.

### 1. Prerequisites
- Docker (Engine + Compose v2) — `docker version` and `docker compose version` must both succeed.
- The Next.js app running: `npm run dev` (serves on `http://localhost:3000`).
- A Supabase project with the Phase 7 migration applied (`supabase/migrations/20261008000000_n8n_automation.sql`) and a `SUPABASE_SERVICE_ROLE_KEY` available.

### 2. Configure env
Create `.env.local` (copy from `.env.example`) with:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        # service role; lets n8n read/write across users
N8N_WEBHOOK_SECRET=...               # shared secret between n8n and the app
N8N_ENCRYPTION_KEY=...               # 32-byte key; generate with: openssl rand -hex 24
AI_API_KEY=...
AI_BASE_URL=...
AI_MODEL=...
```
> `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` is set in `docker-compose.yml`. It lets n8n workflow nodes read the env vars above (Supabase key, webhook secret) via expressions such as `{{$env.SUPABASE_SERVICE_ROLE_KEY}}`. Do not send these to the browser.

### 3. Start n8n
```
npm run dev            # in one terminal — runs the Next.js app on :3000
docker compose up      # in another terminal — starts the n8n container on :5678
```
Open `http://localhost:5678` and finish first-launch setup (create the **owner** account when prompted). `N8N_BASIC_AUTH_*` is not used in n8n 1.x.

### 4. Import the workflows
n8n does not auto-import on startup; import the JSON files into its database once:
```
./scripts/n8n-import.sh
```
Then (re)activate the four workflows in the n8n UI: `study-reminder`, `daily-mission`, `weekly-review`, `processing-retry`.

### 5. Verify
- `GET http://localhost:3000/api/notifications` (authenticated) returns `{ notifications, unreadCount }`.
- Bell icon in the header shows the unread badge; `/settings` shows the feature toggles.
- `/study` shows a "Today's Mission" card when a topic is due.