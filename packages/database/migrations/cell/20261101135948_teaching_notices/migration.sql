alter table core.notifications drop constraint notifications_kind_check;
alter table core.notifications add constraint notifications_kind_check
  check (kind in ('announcement', 'urgent', 'news', 'message', 'absence', 'event', 'reminder', 'consent',
    'mention', 'library', 'reply', 'enquiry', 'application', 'assignment', 'feedback', 'grades'));
