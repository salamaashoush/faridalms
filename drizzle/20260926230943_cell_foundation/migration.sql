-- Schemas, extensions and the functions every later migration relies on:
-- the tenant context, the row-metadata triggers and the erasure predicates
-- that retention policies call. Bodies are checked when they first run,
-- because the erasure predicates read tables the next migration creates.
set local check_function_bodies = off;

create schema ext;
create extension btree_gist with schema ext;
create extension btree_gin with schema ext;
create extension pg_trgm with schema ext;

create schema app;
create schema core;
create schema health;
create schema audit;
create schema parts;
create schema search;
create schema staging;
create schema ops;

revoke all on schema public from public;
grant usage on schema app, core to app, site, integration, worker, collab, cell_io, retention;
grant usage on schema audit to app, integration, worker, cell_io, retention;
grant usage on schema health to app, worker, cell_io, retention;
grant usage, create on schema staging to cell_io;
grant usage on schema ops to worker;

create function app.tenant_id() returns uuid
language plpgsql stable parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare v text := current_setting('app.tenant_id', true);
begin
  if v is null or v = ''
     or current_setting('app.tenant_txn', true) is distinct from
        ((extract(epoch from transaction_timestamp()) * 1000000)::bigint)::text then
    raise exception 'tenant context is not set' using errcode = '42501';
  end if;
  return v::uuid;
end $$;

create function app.user_id() returns uuid
language sql stable parallel safe
set search_path = pg_catalog, pg_temp
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create function app.row_meta() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_user <> 'cell_io' then
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

create function app.row_meta_keyed() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if current_user <> 'cell_io' then
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

create function app.lock(key text) returns void
language sql volatile
set search_path = pg_catalog, pg_temp
as $$ select pg_advisory_xact_lock(hashtextextended(app.tenant_id()::text || ':' || key, 0)) $$;

create function app.erasure_approved(p_tenant uuid, p_subject uuid) returns boolean
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select p_subject is not null
    and exists (select 1 from core.erasure_approvals a
                where a.tenant_id = p_tenant and a.subject_user_id = p_subject)
    and not exists (select 1 from core.legal_holds h
                    where h.tenant_id = p_tenant and h.subject_user_id = p_subject
                      and h.status = 'active' and h.released_at is null)
$$;

create function app.erasure_listed(p_tenant uuid, p_type text, p_object uuid) returns boolean
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select exists (select 1 from core.erasure_items i
                 join core.erasure_approvals a on a.tenant_id = i.tenant_id and a.id = i.approval_id
                 where i.tenant_id = p_tenant and i.object_type = p_type and i.object_id = p_object
                   and app.erasure_approved(a.tenant_id, a.subject_user_id))
$$;

revoke all on all functions in schema app from public;
grant execute on function app.tenant_id(), app.user_id(), app.lock(text)
  to app, site, integration, worker, collab, cell_io, retention;
grant execute on function app.erasure_approved(uuid, uuid), app.erasure_listed(uuid, text, uuid) to retention;

set local check_function_bodies = on;
