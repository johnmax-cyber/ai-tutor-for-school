-- Phase 8 (Stage 8A): Image and advanced document support.
-- Enriches resources with OCR/vision metadata and adds resource_images.

-- Enrich the resource row with OCR / vision / metadata
-- (additive; existing columns preserved)

alter table public.resources
  add column if not exists ocr_used boolean not null default false,
  add column if not exists ocr_confidence double precision,
  add column if not exists processing_metadata jsonb,
  add column if not exists retry_count int not null default 0,
  add column if not exists processing_started_at timestamptz;

-- Extracted/embedded images with optional vision description
-- (for query-time vision + previews)

create table if not exists public.resource_images (
  id uuid primary key default gen_random_uuid(),

  resource_id uuid not null
    references public.resources(id)
    on delete cascade,

  user_id uuid not null
    references auth.users
    on delete cascade,

  page_number int not null,
  image_index int not null default 0,

  storage_path text not null,
  mime_type text not null,

  vision_description text,
  vision_model text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint resource_images_resource_page_idx_unique
    unique (resource_id, page_number, image_index)
);

-- Row Level Security

alter table public.resource_images enable row level security;

-- Make policy creation safe to rerun

drop policy if exists "read own resource_images"
  on public.resource_images;

drop policy if exists "manage own resource_images"
  on public.resource_images;

create policy "read own resource_images"
  on public.resource_images
  for select
  using (auth.uid() = user_id);

create policy "manage own resource_images"
  on public.resource_images
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexes

create index if not exists idx_resource_images_resource
  on public.resource_images (resource_id);

create index if not exists idx_resource_images_user
  on public.resource_images (user_id);