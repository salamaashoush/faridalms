-- A plan that named its modules named only the four a school could switch
-- before the catalogue; everything else was simply there. Every school that
-- exists now keeps it, so nothing it uses disappears.
update school_plans
set modules = (
  select array_agg(distinct name order by name)
  from unnest(modules || array['coursework', 'peer_review', 'gradebook', 'attendance', 'timetable',
    'news', 'website', 'custom_domains', 'admissions', 'student_records', 'badges', 'standards',
    'exams', 'integrations', 'sso', 'sms']::text[]) as name
)
where modules is not null;
