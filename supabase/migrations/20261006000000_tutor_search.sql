create or replace function public.search_resource_chunks(
  p_query text, p_limit int default 12, p_resource_id uuid default null)
returns table (id uuid, resource_id uuid, resource_title text, page_number int,
  chunk_index int, content text, rank real)
language sql stable security invoker set search_path = public
as $$
  select rc.id, rc.resource_id, r.title, rc.page_number, rc.chunk_index, rc.content,
         ts_rank_cd(rc.document, q.tsq) as rank
  from public.resource_chunks rc
  join public.resources r on r.id = rc.resource_id
  cross join (select to_tsquery('simple', p_query) as tsq) q
  where r.user_id = auth.uid() and rc.user_id = auth.uid()
    and r.status = 'ready' and rc.document @@ q.tsq
    and (p_resource_id is null or rc.resource_id = p_resource_id)
  order by rank desc, rc.page_number asc
  limit least(greatest(p_limit, 1), 20);
$$;
revoke all on function public.search_resource_chunks(text, int, uuid) from public, anon;
grant execute on function public.search_resource_chunks(text, int, uuid) to authenticated;