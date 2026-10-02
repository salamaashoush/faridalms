-- Identity documents the record keeps besides national ID and passport, and
-- exam boards' lifetime candidate numbers, for tenants seeded before them.
do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');
    insert into core.descriptors (tenant_id, namespace, code_value, label_en, label_ar,
      system_meaning, sort_order, edfi_uri, seeded)
    select t, 'external_id_system', v.code, v.en, v.ar, v.code, v.sort,
      'uri://ed-fi.org/StudentIdentificationSystemDescriptor#Other', true
    from (values
      ('residence_permit', 'Residence permit number', 'رقم الإقامة', 4),
      ('birth_certificate', 'Birth certificate number', 'رقم شهادة الميلاد', 5),
      ('cambridge_uci', 'Cambridge candidate identifier (UCI)', 'رقم المرشح الموحد لدى كامبريدج', 6),
      ('ib_personal_code', 'IB personal code', 'الرمز الشخصي في البكالوريا الدولية', 7)
    ) as v(code, en, ar, sort)
    where not exists (
      select 1 from core.descriptors d
      where d.tenant_id = t and d.namespace = 'external_id_system' and d.code_value = v.code);
    update core.descriptors d set sort_order = v.sort
    from (values ('sis_id', 8), ('roster_sourced_id', 9), ('legacy_id', 10)) as v(code, sort)
    where d.tenant_id = t and d.namespace = 'external_id_system' and d.code_value = v.code
      and d.seeded;
  end loop;
end $$;
