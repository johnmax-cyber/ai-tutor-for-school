-- Create public.resources table if it does not exist and enable RLS
create table if not exists public.resources (
  id uuid primary key,
  user_id uuid not null,
  title text not null,
  original_filename text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  char_count bigint,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'ready', 'failed')),
  error_message text,
  extracted_text text,
  page_count integer,
  ocr_used boolean,
  ocr_confidence numeric,
  processing_metadata jsonb,
  retry_count integer default 0,
  processing_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable row level security
alter table public.resources enable row level security;

-- Read own resources
create policy "read own resources"
  on public.resources for select
  using (auth.uid() = user_id);

-- Manage own resources
create policy "manage own resources"
  on public.resources for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
