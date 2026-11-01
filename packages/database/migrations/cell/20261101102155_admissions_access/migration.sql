-- What the generated migration cannot express for intakes, forms and
-- applications: their forced row level security and grants, what erasure
-- may empty on an application, the notification kind that tells the office
-- an application arrived, the consent purposes and health kind an
-- application asks for, and the admissions capabilities with the roles that
-- carry them, for tenants made before them.

alter table core.admission_forms force row level security;
alter table core.admission_form_versions force row level security;
alter table core.admission_intakes force row level security;
alter table core.admission_applications force row level security;
alter table core.admission_items force row level security;
alter table core.admission_entries force row level security;

create trigger row_meta before insert or update on core.admission_forms
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.admission_intakes
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.admission_applications
  for each row execute function app.row_meta();
create trigger row_meta before insert or update on core.admission_items
  for each row execute function app.row_meta();

grant select, insert, update on core.admission_forms, core.admission_intakes,
  core.admission_applications, core.admission_items to app, worker, cell_io;
grant select on core.admission_forms, core.admission_intakes,
  core.admission_applications, core.admission_items to retention;
grant select, insert on core.admission_form_versions, core.admission_entries to app, worker, cell_io;
grant select on core.admission_form_versions, core.admission_entries to retention;

-- An approved erasure of the child empties what the family wrote and what
-- matching found, and tombstones the application; the row stays for counts.
grant update (status, metadata, form, answers, matches) on core.admission_applications to retention;

alter table core.notifications drop constraint notifications_kind_check;
alter table core.notifications add constraint notifications_kind_check
  check (kind in ('announcement', 'urgent', 'news', 'message', 'absence', 'event', 'reminder', 'consent',
    'mention', 'library', 'reply', 'enquiry', 'application'));

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');

    insert into core.descriptors (tenant_id, namespace, code_value, label_en, label_ar,
      system_meaning, sort_order, seeded)
    select t, v.namespace, v.code, v.en, v.ar, v.meaning, v.sort, true
    from (values
      ('health_record_kind', 'additional_needs', 'Additional learning needs',
        'احتياجات تعليمية إضافية', 'additional_needs', 9),
      ('consent_purpose', 'admission_processing', 'Processing the application for admission',
        'معالجة طلب الالتحاق', 'admission_processing', 7),
      ('consent_purpose', 'admission_special_category', 'Health and needs in the application',
        'البيانات الصحية والاحتياجات في طلب الالتحاق', 'special_category', 8),
      ('consent_purpose', 'admission_marketing', 'News and events from the school',
        'أخبار المدرسة وفعالياتها', 'marketing', 9)
    ) as v(namespace, code, en, ar, meaning, sort)
    where not exists (
      select 1 from core.descriptors d
      where d.tenant_id = t and d.namespace = v.namespace and d.code_value = v.code);
    update core.descriptors set sort_order = 10
    where tenant_id = t and namespace = 'health_record_kind' and code_value = 'other' and seeded;

    -- The roles that already work admissions also decide and set them up;
    -- every family may apply for another child.
    update core.access_roles
    set capabilities = capabilities || array['admissions:decide', 'admissions:configure']
    where tenant_id = t and status = 'active'
      and not ('admissions:configure' = any (capabilities))
      and (builtin_key in ('site_administrator', 'district_administrator', 'system_administrator',
          'principal', 'admissions_officer'));
    update core.access_roles
    set capabilities = capabilities || array['applications:submit']
    where tenant_id = t and status = 'active' and builtin_key = 'family'
      and not ('applications:submit' = any (capabilities));

    insert into core.access_roles (tenant_id, builtin_key, name_en, name_ar, capabilities)
    select t, 'applicant_family', 'Applying family', 'أسرة متقدمة', array['applications:submit']
    where not exists (
      select 1 from core.access_roles
      where tenant_id = t and builtin_key = 'applicant_family' and org_id is null and status = 'active');
  end loop;
end $$;
