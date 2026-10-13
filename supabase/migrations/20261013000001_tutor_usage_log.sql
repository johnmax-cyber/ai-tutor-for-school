create table if not exists public.tutor_usage_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users not null,
  request_count today not null default 0,
  total_tokens  int not null default 0,
  last_request  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_tutor_usage_log_user
  on public.tutor_usage_log (user_id);
create index if not exists idx_tutor_usage_log_created_at
  on public.tutor_usage_log (created_at);

alter table public.tutor_usage_log enable row level security;
create policy "read own tutor usage log"
  on public.tutor_usage_log for select using (auth.uid() = user_id);
create policy "insert own tutor usage log"
  on public.tutor_usage_log for insert with check (auth.uid() = user_id);