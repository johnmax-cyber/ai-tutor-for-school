create or replace function public.search_resource_chunks_hybrid(
  p_query text,
  p_query_embedding vector default null,
  p_resource_id uuid default null,
  p_limit int default 12,
  p_hybrid_weight float default 0.5,
  p_min_similarity float default 0.0
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
  with fts as (
    select rc.id, rc.resource_id, rc.page_number, rc.chunk_index, rc.content,
           ts_rank_cd(rc.document, q.tsq) as fts_rank,
           row_number() over (order by ts_rank_cd(rc.document, q.tsq) desc, rc.page_number asc, rc.chunk_index asc) as fts_rrn
    from public.resource_chunks rc
    join public.resources r on r.id = rc.resource_id
    cross join (select to_tsquery('simple', p_query) as tsq) q
    where r.user_id = auth.uid() and rc.user_id = auth.uid()
      and r.status = 'ready' and rc.document @@ q.tsq
      and (p_resource_id is null or rc.resource_id = p_resource_id)
      and rc.embedding is not null
  ),
  vec as (
    select rc.id, rc.resource_id, rc.page_number, rc.chunk_index, rc.content,
           1 - (rc.embedding <=> p_query_embedding) as vec_sim,
           row_number() over (order by rc.embedding <=> p_query_embedding asc, rc.page_number asc, rc.chunk_index asc) as vec_rrn
    from public.resource_chunks rc
    join public.resources r on r.id = rc.resource_id
    where r.user_id = auth.uid() and rc.user_id = auth.uid()
      and r.status = 'ready' and rc.embedding is not null
      and (p_resource_id is null or rc.resource_id = p_resource_id)
      and 1 - (rc.embedding <=> p_query_embedding) >= p_min_similarity
  ),
  rrf as (
    select id, resource_id, page_number, chunk_index, content,
           (1 - p_hybrid_weight) * (1.0 / (60 + fts_rrn)) + p_hybrid_weight * (1.0 / (60 + vec_rrn)) as rank
    from fts
    full join vec using (id)
  )
  select id, resource_id, r.title as resource_title, page_number, chunk_index, content, rank
  from rrf
  join public.resources r on r.id = rrf.resource_id
  order by rank desc, page_number asc, chunk_index asc
  limit least(greatest(p_limit, 1), 20);
$$;
revoke all on function public.search_resource_chunks_hybrid(text, vector, uuid, int, float, float) from public, anon;
grant execute on function public.search_resource_chunks_hybrid(text, vector, uuid, int, float, float) to authenticated;

create or replace function public.search_resource_chunks_by_topic_hybrid(
  p_topic_id uuid,
  p_query text default null,
  p_query_embedding vector default null,
  p_limit int default 12,
  p_hybrid_weight float default 0.5,
  p_min_similarity float default 0.0
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
  with topic_resources as (
    select tr.resource_id
    from public.topic_resources tr
    where tr.topic_id = p_topic_id
  ),
  fts as (
    select rc.id, rc.resource_id, rc.page_number, rc.chunk_index, rc.content,
           ts_rank_cd(rc.document, q.tsq) as fts_rank,
           row_number() over (order by ts_rank_cd(rc.document, q.tsq) desc, rc.page_number asc, rc.chunk_index asc) as fts_rrn
    from public.resource_chunks rc
    join public.resources r on r.id = rc.resource_id
    join topic_resources tr on tr.resource_id = r.id
    cross join (select to_tsquery('simple', p_query) as tsq) q
    where r.user_id = auth.uid() and rc.user_id = auth.uid()
      and r.status = 'ready' and rc.document @@ q.tsq
      and rc.embedding is not null
  ),
  vec as (
    select rc.id, rc.resource_id, rc.page_number, rc.chunk_index, rc.content,
           1 - (rc.embedding <=> p_query_embedding) as vec_sim,
           row_number() over (order by rc.embedding <=> p_query_embedding asc, rc.page_number asc, rc.chunk_index asc) as vec_rrn
    from public.resource_chunks rc
    join public.resources r on r.id = rc.resource_id
    join topic_resources tr on tr.resource_id = r.id
    where r.user_id = auth.uid() and rc.user_id = auth.uid()
      and r.status = 'ready' and rc.embedding is not null
      and 1 - (rc.embedding <=> p_query_embedding) >= p_min_similarity
  ),
  rrf as (
    select id, resource_id, page_number, chunk_index, content,
           (1 - p_hybrid_weight) * (1.0 / (60 + fts_rrn)) + p_hybrid_weight * (1.0 / (60 + vec_rrn)) as rank
    from fts
    full join vec using (id)
  )
  select id, resource_id, r.title as resource_title, page_number, chunk_index, content, rank
  from rrf
  join public.resources r on r.id = rrf.resource_id
  order by rank desc, page_number asc, chunk_index asc
  limit least(greatest(p_limit, 1), 20);
$$;
revoke all on function public.search_resource_chunks_by_topic_hybrid(uuid, text, vector, int, float, float) from public, anon;
grant execute on function public.search_resource_chunks_by_topic_hybrid(uuid, text, vector, int, float, float) to authenticated;
