-- A post's picture was a field beside its document. It becomes the
-- document's first picture, in each language with that language's words for
-- it, and the website takes its card picture from there.
do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    update core.documents d
    set content = jsonb_set(d.content, '{root,children}',
          jsonb_build_array(jsonb_build_object(
            'type', 'image', 'version', 1, 'format', '',
            'fileId', p.cover_file_id::text,
            'alt', case when coalesce(d.locale, 'en') = 'ar' then p.cover_alt_ar else p.cover_alt_en end,
            'caption', '', 'size', 'full'))
          || coalesce(d.content #> '{root,children}', '[]'::jsonb)),
        plain_text = btrim(concat_ws(E'\n',
          nullif(case when coalesce(d.locale, 'en') = 'ar' then p.cover_alt_ar else p.cover_alt_en end, ''),
          d.plain_text))
    from core.site_posts p
    where d.tenant_id = t and p.tenant_id = t and p.cover_file_id is not null
      and d.host_type = 'site_post' and d.host_id = p.id and d.status = 'active'
      and d.frozen_at is null;
  end loop;
end $$;
