# Phase 12 — Deployment Guide

## Architecture

```
Frontend / Application
        ↓
    Vercel (Next.js 16)

Database / Storage / Auth
        ↓
    Supabase (PostgreSQL + Storage + Auth)

Automation
        ↓
    n8n (hosted or self-hosted)

Code
    ↓
GitHub
```

---

## 1. Prerequisites (One-Time Setup)

Before deployment, the owner must complete these steps manually (per AGENTS.md:
"Never run supabase CLI or db push. The owner applies SQL by hand."):

1. **Supabase project** — Already created at `https://qjihxfatrxughlslnzax.supabase.co`
2. **GitHub repository** — Code is already in `/home/jim/Desktop/classes` (git-initialized)
3. **Vercel project** — Link to GitHub repo via [vercel.com](https://vercel.com/new)
4. **n8n instance** — Self-hosted via Docker or n8n.cloud

---

## 2. Supabase Migration Application (Owner Action Required)

The following migration files exist in `supabase/migrations/` but must be applied
to the live Supabase database manually by the owner.

### Migration Files (in order)

| File | Purpose |
|---|---|
| `20261005000000_resource_chunks.sql` | `resource_chunks` table + tsvector column + GIN index + RLS |
| `20261006000000_tutor_search.sql` | `search_resource_chunks` RPC function |
| `20261007000000_study_memory.sql` | Study sessions, topics, questions, attempts, mistakes + `search_resource_chunks_by_topic` RPC |
| `20261008000000_n8n_automation.sql` | `user_preferences`, `notifications`, `study_missions` tables |
| `20261009000000_resource_images.sql` | `resource_images` table for vision-processed images |
| `20261010000000_embeddings.sql` | `embedding_usage_log` table + RLS + indexes |
| `20261010000001_hybrid_search.sql` | `search_resource_chunks_hybrid` RPC for hybrid search |
| `20261011000000_embedding_usage_composite_index.sql` | Composite `(user_id, created_at)` index for dashboard query performance |

### How to Apply

1. Open the Supabase Studio dashboard for your project
2. Navigate to **SQL Editor**
3. Copy the contents of each migration file (in the order above)
4. Paste and execute each in the SQL Editor
5. **Critical**: Apply `20261006000000_tutor_search.sql` first — the `search_resource_chunks`
   function is missing from the live database (see REPORT.md §1) and blocks the entire tutor
   retrieval pipeline.

### Verify Application

After applying all migrations, run:

```sql
-- Verify search_resource_chunks RPC exists
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('search_resource_chunks', 'search_resource_chunks_by_topic', 'search_resource_chunks_hybrid');

-- Verify tables exist
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'resource_chunks', 'resources', 'study_sessions', 'questions',
    'attempts', 'mistakes', 'topics', 'user_preferences',
    'notifications', 'study_missions', 'resource_images',
    'embedding_usage_log'
  );
```

---

## 3. Environment Variables (Vercel)

Configure these in the Vercel dashboard under **Project Settings → Environment Variables**.

### Required (marked "Required" in Vercel UI)

| Variable | Preview | Production | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Yes | Public anon key (safe for client) |
| `AI_API_KEY` | Yes | Yes | LLM provider API key (e.g., OpenRouter) |
| `AI_BASE_URL` | Yes | Yes | LLM provider API endpoint |
| `AI_MODEL` | Yes | Yes | Model ID for chat/completion |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Yes | Server-only; used by `lib/automation/auth.ts` and n8n webhooks |
| `N8N_WEBHOOK_SECRET` | Yes | Yes | Secret for authenticating n8n webhook requests |
| `N8N_ENCRYPTION_KEY` | Yes | Yes | 32-byte encryption key for n8n (generated with `openssl rand -hex 24`) |

### Optional (set in Vercel if using these features)

| Variable | Default | Description |
|---|---|---|
| `APP_URL` | `_.vercel URL` | Base URL for n8n webhook callbacks |
| `AI_VISION_MODEL` | `(unset)` | Vision-capable model for image understanding |
| `AI_VISION_BASE_URL` | `(unset)` | Vision API endpoint |
| `AI_VISION_API_KEY` | `(unset)` | Vision API key (falls back to `AI_API_KEY` in code) |
| `VISION_DIAGRAMS_ENABLED` | `"false"` | Enable diagram description generation during ingestion |
| `AI_EMBEDDING_MODEL` | `(unset)` | Embedding model; empty = keyword search only |
| `AI_EMBEDDING_DIMENSIONS` | `768` | Embedding vector dimension |
| `AI_EMBEDDING_BASE_URL` | `(unset)` | Embedding API endpoint (falls back to `AI_BASE_URL`) |
| `AI_EMBEDDING_API_KEY` | `(unset)` | Embedding API key (falls back to `AI_API_KEY`) |
| `MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE` | `200` | Cap to prevent excessive embedding costs |

### Vercel Configuration Note

The `vercel.json` file sets `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as build-time environment variables.
All other variables are runtime-only (no `NEXT_PUBLIC_` prefix), which means
they are resolved at request time in the Vercel serverless functions.

---

## 4. Vercel Deployment

### Initial Setup

```bash
# 1. Push to GitHub
git add .
git commit -m "Phase 12: deployment preparation"
git push origin main

# 2. Connect to Vercel (if not already connected)
# Visit https://vercel.com/new and import your GitHub repository
# Configure the environment variables listed in §3

# 3. Vercel auto-deploys on every push to main
# Preview URLs are generated for each pull request
```

### Build Configuration

```yaml
Build Command: npm run build
Output Directory: .next
Install Command: npm install
```

### Health Checks

After deployment, verify:

1. **Homepage**: Visit `https://<your-app>.vercel.app/` — should show the login page
2. **Auth**: Sign in with Supabase Auth — should redirect to dashboard
3. **API routes**: Visit `https://<your-app>.vercel.app/api/embedding-status` — should return config status JSON
4. **Dashboard**: After login, `https://<your-app>.vercel.app/dashboard` should show the progress overview

### Security Headers (Applied)

The `vercel.json` file configures these response headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

---

## 5. n8n Production Deployment

### Option A: n8n.cloud (Recommended for simplicity)

1. Create an account at [n8n.cloud](https://n8n.cloud)
2. Configure environment variables in the n8n.cloud dashboard:
   - All variables from `.env.local` (see §6 for full list)
   - Set `APP_URL` to your Vercel production URL (e.g., `https://your-app.vercel.app`)
3. Import workflows from `n8n/import-ready/*.json` using the n8n UI
4. Activate each workflow in the n8n UI

### Option B: Self-hosted Docker

```bash
# 1. Clone the repo or copy the n8n/ directory to your server
# 2. Create a production .env file (copy from .env.local, set APP_URL to your Vercel domain)
# 3. Start n8n
docker compose -f docker-compose.yml up -d

# 4. Import workflows
./scripts/n8n-import.sh

# 5. Activate workflows in the n8n UI (http://<server-ip>:5678)
```

### Production Environment for n8n

Ensure these are set in the n8n environment:

```bash
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
N8N_WEBHOOK_SECRET=<same-value-as-vercel>
APP_URL=https://<your-vercel-domain>.vercel.app
N8N_ENCRYPTION_KEY=<32-byte-key>
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
```

### Workflows

| Workflow | Schedule | Purpose |
|---|---|---|
| `daily-mission` | `0 8 * * *` (8 AM UTC daily) | Generate daily study mission per user |
| `weekly-review` | `0 8 * * 1` (Monday 8 AM UTC) | Generate weekly summary for enabled users |
| `processing-retry` | `*/5 * * * *` (every 5 min) | Retry failed document processing jobs |
| `study-reminder` | `0 * * * *` (top of each hour) | Send study reminders to users with reminders enabled |

> **Note**: The `vercel.json` file also defines cron-based routes for these workflows.
> If you are using n8n for scheduling (recommended), you can remove the `crons` section
> from `vercel.json` or keep both as a fallback.

---

## 6. Complete Environment Variable Reference

### Development (.env.local)

All variables are copied from `.env.local`. The existing file has real values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://qjihxfatrxughlslnzax.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
N8N_WEBHOOK_SECRET=a551be6c...
N8N_ENCRYPTION_KEY=67njhFoSJxTMH...
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
AI_API_KEY=sk-or-v1-...
AI_BASE_URL=https://openrouter.ai/api/v1
AI_MODEL=YOUR_SUPPORTED_OPENROUTER_MODEL_ID
TEST_EMAIL=...
TEST_PASSWORD=...
```

### Environment Variable Flow

```
.env.local (local dev, gitignored)
    ↓
.env.example (template, committed to git)
    ↓
Vercel Environment Variables (production/preview)
    ↓
n8n env_file / n8n.cloud env vars
```

### Secrets Inventory

| Variable | Category | Used In | Safe for Client? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | `lib/supabase/*`, `lib/automation/auth.ts` | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public | Same as above | Yes |
| `AI_API_KEY` | Secret | `lib/ai/client.ts` | No |
| `AI_BASE_URL` | Config | `lib/ai/client.ts` | No |
| `AI_MODEL` | Config | `lib/ai/*` | No |
| `AI_VISION_MODEL` | Config | `lib/ai/client.ts` | No |
| `AI_VISION_BASE_URL` | Config | `lib/ai/client.ts` | No |
| `AI_VISION_API_KEY` | Secret | `lib/ai/client.ts` | No |
| `VISION_DIAGRAMS_ENABLED` | Config | `lib/resources/processing.ts` | No |
| `AI_EMBEDDING_MODEL` | Config | `lib/ai/client.ts`, `lib/ai/embeddings.ts` | No |
| `AI_EMBEDDING_DIMENSIONS` | Config | `lib/ai/embeddings.ts` | No |
| `AI_EMBEDDING_BASE_URL` | Config | `lib/ai/client.ts`, `lib/ai/embeddings.ts` | No |
| `AI_EMBEDDING_API_KEY` | Secret | `lib/ai/client.ts`, `lib/ai/embeddings.ts` | No |
| `MAX_EMBEDDABLE_CHUNKS_PER_RESOURCE` | Config | `lib/resources/embeddings.ts` | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | `lib/automation/auth.ts` only | No |
| `N8N_WEBHOOK_SECRET` | Secret | `lib/automation/auth.ts` | No |
| `N8N_ENCRYPTION_KEY` | Secret | README, n8n workflows only (not in app code) | No |

### Code Constants (NOT env vars)

| Constant | Value | Location |
|---|---|---|
| `MAX_VISION_IMAGES_PER_RESOURCE` | `10` | `lib/documents/types.ts:11` |

---

## 7. Post-Deployment Verification

### 1. Run Full Test Suite

```bash
npm run typecheck && npm run lint && npm run build && npm run test:all
```

### 2. Verify Supabase Migrations Applied

```sql
-- All RPC functions exist and execute (returns empty, not error)
SELECT search_resource_chunks('test', 5, null);
SELECT search_resource_chunks_by_topic('test', 5, null);
SELECT search_resource_chunks_hybrid('test', 5, null);
```

### 3. Verify n8n Webhooks Reach Vercel

After activating n8n workflows, verify the cron triggers fire and webhooks
reach your Vercel deployment:

1. Wait for the next cron trigger (or trigger manually in n8n UI)
2. Check Vercel logs: `vercel logs <deployment-url> --follow`
3. Verify the webhook handler in `lib/automation/auth.ts` accepts the request

### 4. Manual End-to-End Test

Per master plan §35 (Definition of Done):

1. Sign in at `https://<your-app>.vercel.app/`
2. Upload a PDF
3. Verify it shows in the resource library
4. Wait for processing (check `processing_retry` n8n webhook fires)
5. Ask the AI tutor a question about the PDF content
6. Verify a grounded answer with citations appears
7. Complete a short study session
8. Verify the study handoff is generated

### 5. CI/CD Verification

Push to `main` branch and verify:

1. GitHub Actions workflow passes all jobs (typecheck, lint, test, build)
2. Vercel deploy-preview job creates a preview URL (on PRs)
3. Vercel deploy-production job deploys on push to `main`

---

## 8. Rollback Procedure

### Vercel Rollback

```bash
# List recent deployments
vercel ls

# Promote a previous deployment to production
vercel --prod --confirm
```

Or use the Vercel dashboard: **Settings → Git → View on Vercel** → select a
deployment → click "..." → **Promote to Production**.

### Database Rollback

Supabase migrations cannot be easily rolled back. If a migration causes issues:

1. Use the SQL Editor to manually revert (e.g., `DROP FUNCTION`, `DROP TABLE`)
2. Apply the corrected migration
3. Document the change in the migration file comments

### n8n Rollback

```bash
# Export current workflows before making changes
docker compose exec n8n n8n export:workflow --all --output /workflows-backup

# Import a known-good version from git
docker compose exec n8n n8n import:workflow --separate --input=/workflows
```

---

## 9. Monitoring & Observability

### Application Logs

```bash
# Vercel logs (requires Vercel CLI)
npm install -g vercel
vercel login
vercel logs <deployment-url> --follow
```

### Supabase Logs

Dashboard → **Logs** — monitor:
- Authentication errors
- Database query performance
- Edge function errors
- Storage operations

### n8n Logs

```bash
docker compose logs -f n8n
```

### AI Usage Tracking

The `embedding_usage_log` table tracks embedding API calls. Use the dashboard at
`/dashboard` to view usage statistics.

---

## 10. DNS Configuration (Custom Domain)

1. Purchase or use an existing domain
2. In Vercel Dashboard → **Settings → Domains**, add your domain
3. Configure DNS records as shown by Vercel (typically a CNAME or A record)
4. Set `APP_URL` environment variable to `https://your-domain.com`
5. Update n8n workflows to use the new `APP_URL` for webhook callbacks

---

## 11. Cost Considerations

- **Vercel**: Free plan includes 100 GB bandwidth, 125k Serverless/Edge Function execution seconds
- **Supabase**: Free tier includes 500MB database, 1GB file storage, 500MB bandwidth
- **n8n**: Self-hosted (free) or n8n.cloud ($20+/month)
- **AI APIs**: Track via the usage dashboard; budget for OpenRouter/embedding costs
- **n8n cloud**: $20/month (Starter), $49/month (Pro)

---

## 12. Quick Start Checklist

- [ ] Push code to GitHub
- [ ] Apply all Supabase migrations from `supabase/migrations/` (owner action)
- [ ] Create Vercel project and link to GitHub repo
- [ ] Set all environment variables in Vercel (§3)
- [ ] Configure custom domain in Vercel (optional)
- [ ] Deploy n8n (n8n.cloud or self-hosted Docker)
- [ ] Set n8n environment variables (§5)
- [ ] Import n8n workflows from `n8n/import-ready/`
- [ ] Activate n8n workflows
- [ ] Verify CI/CD pipeline passes on push
- [ ] Run manual end-to-end test (§7.4)
- [ ] Update master plan status section