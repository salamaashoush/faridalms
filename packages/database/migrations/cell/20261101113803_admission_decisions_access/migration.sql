-- What the generated migration cannot express for decisions, letters and
-- events: their forced row level security, triggers and grants, what
-- erasure may empty, and the letters every school starts with, given to the
-- schools made before them.

alter table core.admission_letters force row level security;
alter table core.admission_events force row level security;

create trigger row_meta before insert or update on core.admission_events
  for each row execute function app.row_meta();

-- Not valid, as every key added to an existing table here: checking the rows
-- already there would read them under forced row security without a tenant.
-- The columns are new and empty, and every row written from now is checked.
alter table core.admission_applications
  add constraint admission_applications_tenant_id_decided_by_user_id_fkey
    foreign key (tenant_id, decided_by_user_id) references core.users (tenant_id, id) not valid,
  add constraint admission_applications_tenant_id_student_user_id_fkey
    foreign key (tenant_id, student_user_id) references core.users (tenant_id, id) not valid,
  add constraint admission_applications_tenant_id_deferred_from_id_fkey
    foreign key (tenant_id, deferred_from_id)
    references core.admission_applications (tenant_id, id) not valid;

grant select, insert, update on core.admission_events to app, worker, cell_io;
grant select on core.admission_events to retention;
grant select, insert on core.admission_letters to app, worker, cell_io;
grant select on core.admission_letters to retention;

-- An approved erasure of the child empties what the office wrote about the
-- events booked for them and tombstones each.
grant update (status, metadata, location, result) on core.admission_events to retention;

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');

    -- The letters of admission each school starts with
    -- (domain/admissions.ts BUILTIN_LETTERS), in each language.
    insert into core.document_templates (tenant_id, org_id, kind, builtin_key, title, state)
    select t, o.id, 'admission_letter', w.key, w.title, 'shared'
    from core.orgs o
    cross join (values
      ('admission_offer_en', 'Offer of a place'),
      ('admission_offer_ar', 'عرض مقعد'),
      ('admission_waitlist_en', 'A place on our waiting list'),
      ('admission_waitlist_ar', 'قائمة الانتظار'),
      ('admission_decline_en', 'Your application'),
      ('admission_decline_ar', 'بشأن طلب الالتحاق'),
      ('admission_welcome_en', 'Welcome to {school}'),
      ('admission_welcome_ar', 'مرحبًا بكم في {school}')) as w(key, title)
    where o.tenant_id = t and o.type = 'school' and o.status = 'active'
    on conflict (tenant_id, org_id, builtin_key) where builtin_key is not null do nothing;
    insert into core.documents (tenant_id, host_type, host_id, org_id, kind, schema_version, locale,
      content, plain_text)
    select g.tenant_id, 'document_template', g.id, g.org_id, 'rich_text', 1, right(g.builtin_key, 2),
      jsonb_build_object('root', jsonb_build_object('type', 'root', 'version', 1, 'direction', null,
        'format', '', 'indent', 0, 'children',
        (select jsonb_agg(jsonb_build_object('type', 'paragraph', 'version', 1,
            'direction', null, 'format', '', 'indent', 0, 'textFormat', 0, 'textStyle', '',
            'children', case when l.line = '' then '[]'::jsonb else jsonb_build_array(
              jsonb_build_object('type', 'text', 'version', 1, 'format', 0, 'detail', 0,
                'mode', 'normal', 'style', '', 'text', l.line)) end) order by l.ord)
          from regexp_split_to_table(w.body, e'\n') with ordinality as l(line, ord)))),
      w.body
    from core.document_templates g
    join (values
      ('admission_offer_en', e'Dear {family},\n\nWe are delighted to offer {child} a place in {grade} for the {year} school year.\n\nPlease accept or decline the offer from your family account by {expires}. If we do not hear from you by then, the place will be offered to another child.\n\nYour application number is {reference}. Once you accept, we will write to you about the next steps before the year begins.\n\nWith warm regards,\n{school}'),
      ('admission_offer_ar', e'إلى {family}،\n\nتحية طيبة وبعد،\n\nيسعدنا أن نعرض على {child} مقعدًا في {grade} للعام الدراسي {year}.\n\nنرجو قبول العرض أو الاعتذار عنه من حساب الأسرة في موعد أقصاه {expires}، وإن لم يصلنا ردكم حتى ذلك الحين عُرض المقعد على طفل آخر.\n\nرقم طلبكم {reference}، وبعد قبولكم العرض سنراسلكم بالخطوات التالية قبل بداية العام.\n\nمع أطيب التحيات،\n{school}'),
      ('admission_waitlist_en', e'Dear {family},\n\nThank you for applying to {school} for {child}. We have more applications for {grade} in {year} than places, and we are not able to offer {child} a place at this time.\n\nWe have placed {child} on our waiting list. If a place becomes available, we offer it in the order of our admission criteria and will write to you straight away.\n\nYour application number is {reference}. You can leave the waiting list at any time from your family account.\n\nWith kind regards,\n{school}'),
      ('admission_waitlist_ar', e'إلى {family}،\n\nتحية طيبة وبعد،\n\nنشكركم على تقديم طلب التحاق {child} بـ{school}. لقد تجاوز عدد الطلبات المقدَّمة إلى {grade} للعام الدراسي {year} عدد المقاعد المتاحة، ولذلك لا يمكننا أن نعرض على {child} مقعدًا في الوقت الحالي.\n\nوقد أدرجنا {child} في قائمة الانتظار، وإذا توفر مقعد عرضناه وفق ترتيب معايير القبول لدينا وراسلناكم فورًا.\n\nرقم طلبكم {reference}، ويمكنكم الخروج من قائمة الانتظار في أي وقت من حساب الأسرة.\n\nمع أطيب التحيات،\n{school}'),
      ('admission_decline_en', e'Dear {family},\n\nThank you for your interest in {school} and for the time you gave to the application for {child} to join {grade} in {year}.\n\nAfter careful consideration, we are sorry that we are not able to offer {child} a place.\n\nWe wish {child} every success, and we thank you again for thinking of us.\n\nWith kind regards,\n{school}'),
      ('admission_decline_ar', e'إلى {family}،\n\nتحية طيبة وبعد،\n\nنشكركم على اهتمامكم بـ{school} وعلى الوقت الذي خصصتموه لطلب التحاق {child} بـ{grade} للعام الدراسي {year}.\n\nوبعد دراسة الطلب بعناية، نأسف لعدم تمكننا من عرض مقعد على {child}.\n\nنتمنى لـ{child} كل التوفيق، ونشكركم مجددًا على ثقتكم.\n\nمع أطيب التحيات،\n{school}'),
      ('admission_welcome_en', e'Dear {family},\n\nWelcome to {school}. {child} is now enrolled in {grade} for the {year} school year, and we look forward to meeting you.\n\nYour family account now opens {child}''s record at the school. Before the year begins we will share the calendar, the uniform and supplies list, and the arrangements for the first day.\n\nWith warm regards,\n{school}'),
      ('admission_welcome_ar', e'إلى {family}،\n\nتحية طيبة وبعد،\n\nيسعدنا أن نرحب بكم في {school}، فقد أصبح {child} مقيدًا في {grade} للعام الدراسي {year}، ونتطلع إلى لقائكم.\n\nيتيح لكم حساب الأسرة الآن الاطلاع على سجل {child} في المدرسة، وقبل بداية العام سنرسل إليكم التقويم الدراسي وقائمة الزي المدرسي والأدوات وترتيبات اليوم الأول.\n\nمع أطيب التحيات،\n{school}'))
      as w(key, body) on w.key = g.builtin_key
    where g.tenant_id = t and not exists (select 1 from core.documents d
      where d.tenant_id = g.tenant_id and d.host_type = 'document_template' and d.host_id = g.id);
  end loop;
end $$;
