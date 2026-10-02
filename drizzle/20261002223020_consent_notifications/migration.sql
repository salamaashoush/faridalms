-- A school asking a family for consent tells them with a notification of
-- its own kind, which families can choose how to receive.
alter table core.notifications drop constraint notifications_kind_check;
alter table core.notifications add constraint notifications_kind_check
  check (kind in ('announcement', 'urgent', 'news', 'message', 'absence', 'event', 'reminder', 'consent'));
