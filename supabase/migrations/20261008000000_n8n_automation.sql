-- Phase 7: n8n Automation
-- Adds in-app notifications, daily/weekly study missions, and per-user automation
-- preferences consumed by n8n workflows. All tables are owner-only (RL
-- auth.uid() = user_id) so background workers must use a service_role key.

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

-- Daily/weekly missions created by n8n (or the app)
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

-- Per-user automation preferences (one row per user)
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users on delete cascade,
  study_reminders_enabled boolean not null default true,
  reminder_time time not null default '09:00:00',
  daily_mission_enabled boolean not null default true,
  weekly_summary_enabled boolean not null default true,
  processing_retry_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_notifications_user on public.notifications (user_id);
create index if not exists idx_notifications_unread on public.notifications (user_id) where read_at is null;
create index if not exists idx_notifications_created on public.notifications (created_at desc);
create index if not exists idx_missions_user on public.study_missions (user_id);
create index if not exists idx_missions_scheduled on public.study_missions (scheduled_for desc);
create index if not exists idx_missions_pending on public.study_missions (user_id, completed) where completed = false;

-- Enable Row Level Security
alter table public.notifications enable row level security;
alter table public.study_missions enable row level security;
alter table public.user_preferences enable row level security;

-- RLS Policies: owner-only access
-- Notifications
create policy "read own notifications"
  on public.notifications for select using (auth.uid() = user_id);
create policy "manage own notifications"
  on public.notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Study missions
create policy "read own missions"
  on public.study_missions for select using (auth.uid() = user_id);
create policy "manage own missions"
  on public.study_missions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- User preferences
create policy "read own preferences"
  on public.user_preferences for select using (auth.uid() = user_id);
create policy "manage own preferences"
  on public.user_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
