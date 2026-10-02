-- Website and social media photo consents shared one meaning, so a yes to
-- social media let a child's photo onto the website. Each now has its own.
do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    update core.descriptors set system_meaning = 'photo_website'
    where tenant_id = t and namespace = 'consent_purpose' and code_value = 'photo_school_website'
      and system_meaning = 'photo_public';
    update core.descriptors set system_meaning = 'photo_social'
    where tenant_id = t and namespace = 'consent_purpose' and code_value = 'photo_social_media'
      and system_meaning = 'photo_public';
  end loop;
end $$;
