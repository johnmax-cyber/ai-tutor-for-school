-- Phase 5: Learning Memory
-- Adds support for subjects, topics, concepts, study sessions, questions, attempts, mistakes, and topic-scoped search

-- Optional grouping for topics
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Primary unit of study + progress tracking (mastery fields stored here for MVP)
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  subject_id uuid references public.subjects(id) on delete set null,
  name text not null,
  description text default '',
  mastery_state text not null default 'not_started'
    check (mastery_state in ('not_started','learning','developing','strong','review_needed')),
  total_attempts bigint not null default 0,
  correct_attempts bigint not null default 0,
  hints_used bigint not null default 0,
  retry_count bigint not null default 0,
  last_studied timestamptz,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sub-units of a topic (created but NOT separately tracked for MVP)
create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  name text not null,
  description text default '',
  created_at timestamptz not null default now()
);

-- Many-to-many: resources ↔ topics
create table if not exists public.resources_topics (
  resource_id uuid not null references public.resources(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resource_id, topic_id)
);

-- A study session: one topic, multiple questions, multiple attempts
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  topic_id uuid not null references public.topics(id) on delete set null,
  status text not null default 'active'
    check (status in ('active','completed','abandoned')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  handoff_text text,
  questions_attempted bigint not null default 0,
  total_attempts bigint not null default 0,
  correct_attempts bigint not null default 0,
  hints_used bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- AI-generated questions linked to a session
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  concept_id uuid references public.concepts(id) on delete set null,
  content text not null,
  answer_key text,           -- AI-generated; never sent to client
  explanation text,
  hint text,
  difficulty text default 'medium' check (difficulty in ('easy','medium','hard')),
  created_at timestamptz not null default now()
);

-- Student attempts
create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  answer_text text not null,
  is_correct boolean not null,
  feedback text,
  attempt_number int not null default 1,  -- 1 = first try, 2 = retry
  created_at timestamptz not null default now()
);

-- Tracked mistakes for review scheduling
create table if not exists public.mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  concept_id uuid references public.concepts(id) on delete set null,
  question_id uuid references public.questions(id) on delete set null,
  description text not null,    -- observed misconception
  incorrect_count int not null default 1,
  correct_count int not null default 0,
  hint_count int not null default 0,
  last_seen timestamptz not null default now(),
  recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index idx_topics_user on public.topics (user_id);
create index idx_topics_next_review on public.topics (next_review_at) where next_review_at is not null;
create index idx_sessions_user on public.study_sessions (user_id);
create index idx_sessions_user_status on public.study_sessions (user_id, status);
create index idx_questions_session on public.questions (session_id);
create index idx_attempts_question on public.attempts (question_id);
create index idx_attempts_session on public.attempts (session_id);
create index idx_mistakes_user_topic on public.mistakes (user_id, topic_id);
create index idx_mistakes_recurring on public.mistakes (recurring) where recurring = true;
create index idx_resources_topics_topic on public.resources_topics (topic_id);
create index idx_resources_topics_resource on public.resources_topics (resource_id);

-- Enable Row Level Security on all new tables
alter table public.subjects enable row level security;
alter table public.topics enable row level security;
alter table public.concepts enable row level security;
alter table public.resources_topics enable row level security;
alter table public.study_sessions enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.mistakes enable row level security;

-- RLS Policies: Owner-only access
-- Subjects
create policy "read own subjects" on public.subjects for select using (auth.uid() = user_id);
create policy "manage own subjects" on public.subjects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Topics
create policy "read own topics" on public.topics for select using (auth.uid() = user_id);
create policy "manage own topics" on public.topics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Concepts
create policy "read own concepts" on public.concepts for select using (auth.uid() = user_id);
create policy "manage own concepts" on public.concepts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Resources_Topics: enforce ownership via both sides
create policy "read own resource_topics" on public.resources_topics for select using (
  exists (select 1 from public.resources r where r.id = resource_id and r.user_id = auth.uid())
  or exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid())
);
create policy "manage own resource_topics" on public.resources_topics for all using (
  exists (select 1 from public.resources r where r.id = resource_id and r.user_id = auth.uid())
) with check (
  exists (select 1 from public.topics t where t.id = topic_id and t.user_id = auth.uid())
);

-- Study_Sessions
create policy "read own sessions" on public.study_sessions for select using (auth.uid() = user_id);
create policy "manage own sessions" on public.study_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Questions
create policy "read own questions" on public.questions for select using (auth.uid() = user_id);
create policy "manage own questions" on public.questions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Attempts
create policy "read own attempts" on public.attempts for select using (auth.uid() = user_id);
create policy "manage own attempts" on public.attempts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Mistakes
create policy "read own mistakes" on public.mistakes for select using (auth.uid() = user_id);
create policy "manage own mistakes" on public.mistakes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- New stored function: topic-scoped search
-- Searches resource chunks within resources belonging to a specific topic
create or replace function public.search_resource_chunks_by_topic(
  p_query text,
  p_limit int default 12,
  p_topic_id uuid default null
)
returns table (
  id uuid,
  resource_id uuid,
  resource_title text,
  page_number int,
  chunk_index int,
  content text,
  rank real
)
language sql stable security invoker set search_path = public
as $$
  select
    rc.id,
    rc.resource_id,
    r.title as resource_title,
    rc.page_number,
    rc.chunk_index,
    rc.content,
    ts_rank_cd(rc.document, q.tsq) as rank
  from public.resource_chunks rc
  join public.resources r
    on r.id = rc.resource_id
    and r.user_id = auth.uid()
    and r.status = 'ready'
  cross join (select to_tsquery('simple', p_query) as tsq) q
  where rc.document @@ q.tsq
    and exists (
      select 1 from public.resources_topics rt
      join public.topics t on t.id = rt.topic_id and t.user_id = auth.uid()
      where rt.resource_id = rc.resource_id
        and t.id = p_topic_id
    )
  order by rank desc, rc.page_number asc
  limit least(greatest(p_limit, 1), 20);
$$;

-- Grant execute permission on the new function to authenticated users
grant execute on function public.search_resource_chunks_by_topic(text, int, uuid) to authenticated;