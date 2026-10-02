-- An announcement's single title becomes the title in its own language:
-- Arabic letters make it the Arabic title, anything else the English one,
-- and the announcement's document takes that language too. The search index
-- follows both titles from now on.

drop trigger index_host on core.announcements;

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');

    update core.announcements
    set title_ar = case when title ~ '[؀-ۿ]' then title else '' end,
        title_en = case when title ~ '[؀-ۿ]' then '' else title end
    where tenant_id = t;

    update core.documents d
    set locale = case when a.title_ar <> '' then 'ar' else 'en' end
    from core.announcements a
    where d.tenant_id = t and a.tenant_id = d.tenant_id and d.host_type = 'announcement'
      and d.host_id = a.id and d.translation_of_id is null and d.locale is null;
  end loop;
end $$;

create trigger index_host after insert or update of title_ar, title_en, status, org_id on core.announcements
  for each row execute function app.index_host('announcement', 'title_ar', 'title_en');
