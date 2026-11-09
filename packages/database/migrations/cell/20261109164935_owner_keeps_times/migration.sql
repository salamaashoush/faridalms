-- The schema owner keeps the times it writes, as the importer does: an
-- operator filling a school with its history (a demonstration, a move from
-- another system) dates each message and record when it happened. The
-- application's runtime roles never act as the owner, so what they write is
-- still stamped with the moment of writing.
create or replace function app.row_meta() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_user not in ('cell_io', 'cell_owner') then
      new.version := 1;
      new.date_last_modified := statement_timestamp();
      new.created_at := statement_timestamp();
    end if;
  else
    if new.id <> old.id then
      raise exception 'id is immutable' using errcode = '42501';
    end if;
    new.version := old.version + 1;
    new.date_last_modified := statement_timestamp();
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
--> statement-breakpoint
create or replace function app.row_meta_keyed() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_user not in ('cell_io', 'cell_owner') then
      new.version := 1;
      new.date_last_modified := statement_timestamp();
      new.created_at := statement_timestamp();
    end if;
  else
    if (to_jsonb(new) -> tg_argv[0]) is distinct from (to_jsonb(old) -> tg_argv[0]) then
      raise exception '% is immutable', tg_argv[0] using errcode = '42501';
    end if;
    new.version := old.version + 1;
    new.date_last_modified := statement_timestamp();
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
