-- A teacher who offers a piece to the school library is told when a
-- reviewer shares it or sends it back, with a notification of its own kind
-- they can choose how to receive.
alter table core.notifications drop constraint notifications_kind_check;
alter table core.notifications add constraint notifications_kind_check
  check (kind in ('announcement', 'urgent', 'news', 'message', 'absence', 'event', 'reminder', 'consent', 'mention', 'library'));
