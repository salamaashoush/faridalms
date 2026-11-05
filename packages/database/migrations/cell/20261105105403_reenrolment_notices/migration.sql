-- Families are asked whether each child returns next year.
alter table core.notifications drop constraint notifications_kind_check;
alter table core.notifications add constraint notifications_kind_check
  check (kind in ('announcement', 'urgent', 'news', 'message', 'absence', 'event', 'reminder', 'consent',
    'mention', 'library', 'reply', 'enquiry', 'application', 'correction', 'assignment', 'feedback',
    'grades', 'reenrolment'));

-- Who said what of a student's next year. Not validated here: existing rows
-- hold no one yet, and the check cannot read them without a tenant bound.
alter table core.student_school_years
  add constraint student_school_years_tenant_id_intention_by_user_id_fkey
    foreign key (tenant_id, intention_by_user_id) references core.users (tenant_id, id) not valid;
