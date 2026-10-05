create table if not exists public.resource_chunks (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  user_id uuid references auth.users not null,
  page_number int not null,
  chunk_index int not null,
  char_start int not null,
  char_end int not null,
  content text not null,
  token_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_chunks_resource_page_idx_unique unique (resource_id, chunk_index)
);

alter table public.resource_chunks enable row level security;
create policy "read own chunks"
  on public.resource_chunks for select using (auth.uid() = user_id);
create policy "manage own chunks"
  on public.resource_chunks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index idx_resource_chunks_resource
  on public.resource_chunks (resource_id, chunk_index);
create index idx_resource_chunks_user
  on public.resource_chunks (user_id);

alter table public.resource_chunks
  add column if not exists document
    tsvector generated always as (to_tsvector('simple', content)) stored;
create index idx_resource_chunks_search
  on public.resource_chunks using gin (document);

alter table public.resources add column if not exists char_count bigint;