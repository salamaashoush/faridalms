-- Staff attending a tour, assessment or interview are told when it is booked, moved or called off.
alter table core.notifications drop constraint notifications_kind_check;
alter table core.notifications add constraint notifications_kind_check
  check (kind in ('announcement', 'urgent', 'news', 'message', 'absence', 'event', 'reminder', 'consent',
    'mention', 'library', 'reply', 'enquiry', 'application', 'correction', 'assignment', 'feedback',
    'grades', 'reenrolment', 'admission_event'));
