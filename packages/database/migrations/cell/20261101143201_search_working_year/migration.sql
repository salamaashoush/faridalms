-- Classes of the year a school is working in rank above the same names in
-- other years, so "7A" finds this year's class first.
drop function app.search(text, text[], uuid[], real, uuid, integer);

create function app.search(q text, types text[], org_scope uuid[] default null,
  after_rank real default null, after_id uuid default null, max_rows integer default 50,
  prefer_year uuid default null)
returns table (result_type text, result_id uuid, rank real)
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  with query as (
    select app.normalize_name(q) as norm,
           websearch_to_tsquery('arabic', q) as ar,
           websearch_to_tsquery('english', q) as en
  ), hits as (
    select e.result_type, e.result_id,
           greatest(coalesce(ext.word_similarity(query.norm, e.name_norm), 0),
                    coalesce(ts_rank(e.text_vector, query.ar || query.en), 0))::real as rank
    from search.entries e, query
    where e.tenant_id = app.tenant_id()
      and e.result_type = any (types)
      and (org_scope is null or cardinality(e.org_ids) = 0 or e.org_ids && org_scope)
      and (query.norm operator(ext.<%) e.name_norm
           or e.text_vector @@ query.ar
           or e.text_vector @@ query.en)
  ), best as (
    select h.result_type, h.result_id,
           (max(h.rank) + case when prefer_year is not null and h.result_type = 'class'
              and exists (select 1 from core.classes c
                          where c.tenant_id = app.tenant_id() and c.id = h.result_id
                            and c.school_year_id = prefer_year)
              then 1 else 0 end)::real as rank
    from hits h group by h.result_type, h.result_id
  )
  select b.result_type, b.result_id, b.rank from best b
  where after_rank is null or (b.rank, b.result_id) < (after_rank, after_id)
  order by b.rank desc, b.result_id desc
  limit least(max_rows, 200)
$$;

revoke all on function app.search(text, text[], uuid[], real, uuid, integer, uuid) from public;
grant execute on function app.search(text, text[], uuid[], real, uuid, integer, uuid) to app, worker;
