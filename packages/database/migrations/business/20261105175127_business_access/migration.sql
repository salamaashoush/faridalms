-- The console is the business database's only client. Its event log is
-- appended to and read, never changed.
grant usage on schema public to business_admin;
grant select, insert, update on operators to business_admin;
grant select, insert on business_events to business_admin;
