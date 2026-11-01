-- Whoever posts in a discussion is told when someone replies to their
-- post, with a notification of its own kind they can choose how to receive.
alter table core.notifications drop constraint notifications_kind_check;
alter table core.notifications add constraint notifications_kind_check
  check (kind in ('announcement', 'urgent', 'news', 'message', 'absence', 'event', 'reminder', 'consent', 'mention', 'library', 'reply'));
