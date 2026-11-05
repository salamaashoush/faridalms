-- Each unit of work reads, with the tenant's lifecycle, how many times the
-- operator console has changed what its schools may use, so a server holding
-- the tenant's directory rows knows at once that they are stale.
create function app.tenant_entitlements_version() returns integer
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$ select entitlements_version from ops.tenant_registry where tenant_id = app.tenant_id() $$;

drop function app.begin_unit(uuid, uuid, uuid, uuid, text, text);

create function app.begin_unit(p_tenant uuid, p_user uuid, p_account uuid, p_session uuid,
  p_request text, p_actor text) returns table (lifecycle text, entitlements_version integer)
language plpgsql volatile
set search_path = pg_catalog, pg_temp
as $$
begin
  perform set_config('app.tenant_id', p_tenant::text, true),
          set_config('app.tenant_txn', ((extract(epoch from transaction_timestamp()) * 1000000)::bigint)::text, true),
          set_config('app.user_id', coalesce(p_user::text, ''), true),
          set_config('app.account_id', coalesce(p_account::text, ''), true),
          set_config('app.session_id', coalesce(p_session::text, ''), true),
          set_config('app.request_id', coalesce(p_request, ''), true),
          set_config('app.actor_kind', coalesce(p_actor, 'system'), true),
          set_config('app.purpose', '', true);
  return query select app.tenant_lifecycle(), app.tenant_entitlements_version();
end $$;

revoke all on function app.tenant_entitlements_version(), app.begin_unit(uuid, uuid, uuid, uuid, text, text)
  from public;
grant execute on function app.tenant_entitlements_version(), app.begin_unit(uuid, uuid, uuid, uuid, text, text)
  to app, site, integration, worker, collab, cell_io, retention;
