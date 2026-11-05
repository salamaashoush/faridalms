-- The console publishes entitlements and every cell reads them, as it read
-- plans.
grant select on school_entitlements to directory_reader;
grant select, insert, update, delete on school_entitlements to directory_admin;

-- A school without a row now has Basic, where a school without a plan had
-- every module. Every school that exists keeps every module it had and its
-- current storage until it renews under a contract.
insert into school_entitlements (school_id, modules, pool_bytes, class_bytes, module_bytes,
  person_bytes)
select s.id,
  coalesce(p.modules, array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable',
    'news', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards',
    'exams', 'elearning', 'early_years', 'coding', 'video', 'integrations', 'sso', 'sms']::text[]),
  coalesce(p.pool_bytes, 107374182400),
  coalesce(p.class_bytes, 1073741824),
  coalesce(p.module_bytes, 1073741824),
  coalesce(p.person_bytes, 524288000)
from schools s
left join school_plans p on p.school_id = s.id
on conflict (school_id) do nothing;
