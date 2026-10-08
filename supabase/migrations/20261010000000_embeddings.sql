create extension if not exists vector;

alter table public.resource_chunks
  add column if not exists embedding       vector(768),
  add column if not exists embedding_model text,
  add column if not exists embedding_dim   int,
  add column if not exists embedding_created_at timestamptz,
  add column if not exists embedding_skipped boolean not null default false,
  add column if not exists content_hash    text;

create table if not exists public.embedding_usage_log (
  id            uuid primary key default gen_random_uuid(),
  resource_id   uuid not null references public.resources(id) on delete cascade,
  user_id       uuid references auth.users not null,
  chunk_count   int not null default 0,
  prompt_tokens int not null default 0,
  model         text,
  status        text not null default 'pending',
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_embedding_usage_log_resource
  on public.embedding_usage_log (resource_id);
create index if not exists idx_embedding_usage_log_user
  on public.embedding_usage_log (user_id);
create index if not exists idx_embedding_usage_log_created_at
  on public.embedding_usage_log (created_at);

alter table public.embedding_usage_log enable row level security;
create policy "read own embedding usage log"
  on public.embedding_usage_log for select using (auth.uid() = user_id);
create policy "insert own embedding usage log"
  on public.embedding_usage_log for insert with check (auth.uid() = user_id);
