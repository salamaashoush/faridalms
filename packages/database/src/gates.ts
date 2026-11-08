/**
 * Gate 1, the catalogue check: it must return no rows. The lists at its top
 * are part of the contract, so adding a definer function, a DELETE grant, a
 * column-granted table or a purpose gate means changing them here in the same
 * review.
 */
export const CATALOGUE_CHECK = `
with runtime(role) as (values ('app'), ('site'), ('integration'), ('worker'), ('collab'), ('cell_io'), ('retention')),
t as (
  select c.oid, n.nspname, c.relname, c.relrowsecurity as r, c.relforcerowsecurity as f,
         n.nspname || '.' || c.relname as name,
         exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'version' and not a.attisdropped)
           as versioned
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'audit', 'health') and c.relkind in ('r', 'p') and not c.relispartition
),
delete_allowed(name, role) as (values
  ('core.sessions', 'retention'), ('core.auth_attempts', 'retention'),
  ('core.external_ids', 'retention'), ('core.contact_points', 'retention'),
  ('core.relationship_restrictions', 'retention'),
  ('core.login_identities', 'retention'), ('core.passkeys', 'retention'), ('core.devices', 'retention'),
  ('core.files', 'retention'), ('core.file_subjects', 'retention'), ('core.user_preferences', 'retention'),
  ('core.saved_views', 'retention'), ('health.records', 'retention'),
  ('health.requested_changes', 'retention'),
  ('audit.payloads', 'retention'), ('core.calendar_feeds', 'retention'), ('core.document_files', 'retention'),
  ('core.lesson_runs', 'retention'), ('core.lesson_code', 'retention'), ('core.lesson_projects', 'retention'),
  ('core.lesson_shares', 'retention'), ('core.access_arrangements', 'retention'),
  ('core.quiz_draws', 'retention'), ('core.quiz_sittings', 'retention'),
  ('core.standard_evidence', 'retention'), ('core.goal_judgements', 'retention'),
  ('core.goal_reports', 'retention'),
  ('core.standard_observations', 'retention'),
  ('core.peer_reviews', 'retention'), ('core.lti_replays', 'retention'), ('core.lti_scores', 'retention'),
  ('core.module_audiences', 'retention'), ('core.lesson_openings', 'retention'),
  ('core.document_holds', 'retention')),
unversioned_update_allowed(name, role) as (values
  ('core.sessions', 'app'), ('core.sessions', 'worker'), ('core.auth_attempts', 'app'), ('core.auth_attempts', 'worker'),
  ('core.tenant_keys', 'worker'), ('core.document_holds', 'app'), ('core.document_holds', 'worker'),
  ('core.tenant_keys', 'retention'), ('core.document_versions', 'retention'),
  ('core.lesson_responses', 'retention')),
column_granted(name, role) as (values
  ('core.tenants', 'app'), ('core.orgs', 'app'), ('core.descriptors', 'app'), ('core.files', 'app'),
  ('core.accounts', 'app'), ('core.passkeys', 'app'), ('core.access_roles', 'app'),
  ('core.site_enquiries', 'site')),
purpose_gated(name, policy, purpose) as (values
  ('health.records', 'purpose_gate', 'health'), ('health.requested_changes', 'purpose_gate', 'health'),
  ('core.demographics', 'purpose_gate', 'demographics'),
  ('core.relationship_restrictions', 'purpose_gate', 'custody'), ('core.files', 'files_purpose_gate', null)),
required_trigger(name, trigger) as (values
  ('audit.log', 'hash_row'), ('audit.log', 'refuse_update_delete'), ('audit.log', 'refuse_truncate'),
  ('audit.payloads', 'check_payload'), ('audit.payloads', 'refuse_update'),
  ('audit.seal_batches', 'refuse_update_delete'), ('audit.seal_members', 'refuse_update_delete'),
  ('audit.anchors', 'refuse_update_delete'), ('core.documents', 'documents_frozen_guard')),
outside_allowed(name, role, privilege) as (values
  ('ops.tenant_registry', 'worker', 'SELECT'), ('ops.sms_suppressions', 'worker', 'SELECT'),
  ('ops.sms_suppressions', 'worker', 'INSERT'), ('ops.sms_suppressions', 'worker', 'DELETE'),
  ('pgboss.queue', 'app', 'SELECT')),
definer_allowed(proc) as (values
  ('app.tenant_lifecycle()'), ('app.tenant_entitlements_version()'), ('app.search(text,text[],uuid[],real,uuid,integer,uuid,uuid[])'), ('app.index_user()'),
  ('app.index_user_orgs()'), ('app.index_document()'), ('app.index_translation()'),
  ('app.index_host()'), ('app.index_message()'),
  ('app.ensure_partitions(integer,date)'), ('app.change_year_span(uuid,daterange,integer)'))
select name, 'first column is not tenant_id' as problem from t
  where not exists (select 1 from pg_attribute a where a.attrelid = t.oid and a.attnum = 1 and a.attname = 'tenant_id')
union all
select name, 'row level security not enabled and forced' from t where not (r and f)
union all
select name, 'no restrictive tenant_isolation policy' from t where not exists (
  select 1 from pg_policy p where p.polrelid = t.oid and p.polname = 'tenant_isolation'
    and not p.polpermissive and p.polcmd = '*' and p.polroles = '{0}'
    and pg_get_expr(p.polqual, p.polrelid) = '(tenant_id = ( SELECT app.tenant_id() AS tenant_id))'
    and pg_get_expr(p.polwithcheck, p.polrelid) = '(tenant_id = ( SELECT app.tenant_id() AS tenant_id))')
union all
select name, 'permissive policy ' || p.polname || ' applies to public' from t
  join pg_policy p on p.polrelid = t.oid where p.polpermissive and p.polroles @> '{0}'
union all
select pg.name, 'purpose gate ' || pg.policy || ' missing or not restrictive' from purpose_gated pg
  where not exists (select 1 from pg_policy p where p.polrelid = to_regclass(pg.name) and p.polname = pg.policy
    and not p.polpermissive and p.polcmd = '*' and p.polroles = '{0}'
    and (pg.purpose is null or pg_get_expr(p.polqual, p.polrelid) like '%''' || pg.purpose || '''%'))
union all
select name, p.polname || ' lets retention change rows without an erasure approval' from t
  join pg_policy p on p.polrelid = t.oid
  where p.polcmd in ('w', 'd') and p.polroles @> array[(select oid from pg_roles where rolname = 'retention')]
    and name not in ('core.tenant_keys', 'core.auth_attempts', 'core.lti_replays')
    and coalesce(pg_get_expr(p.polqual, p.polrelid), '') not like '%erasure_%'
union all
select name, 'names an outside contact without an erasure rule' from t
  where name <> 'core.erasure_approvals'
    and exists (select 1 from pg_constraint k where k.conrelid = t.oid and k.contype = 'f'
      and k.confrelid = to_regclass('core.message_contacts'))
    and not exists (select 1 from pg_policy p where p.polrelid = t.oid and p.polcmd in ('w', 'd')
      and p.polroles @> array[(select oid from pg_roles where rolname = 'retention')])
union all
select name, k.conname || ' does not lead with tenant_id' from t
  join pg_constraint k on k.conrelid = t.oid and k.contype in ('p', 'u', 'x', 'f')
  where (select attname from pg_attribute where attrelid = t.oid and attnum = k.conkey[1]) <> 'tenant_id'
union all
select name, k.conname || ' references a key without tenant_id first' from t
  join pg_constraint k on k.conrelid = t.oid and k.contype = 'f'
  where (select attname from pg_attribute where attrelid = k.confrelid and attnum = k.confkey[1]) <> 'tenant_id'
union all
select name, i.indexrelid::regclass::text || ' is unique without tenant_id first' from t
  join pg_index i on i.indrelid = t.oid
  where i.indisunique and (select attname from pg_attribute where attrelid = t.oid and attnum = i.indkey[0])
    is distinct from 'tenant_id'
union all
select n.nspname || '.' || c.relname, 'view without security_invoker' from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'audit', 'health', 'app') and c.relkind in ('v', 'm')
    and not coalesce('security_invoker=true' = any (c.reloptions), false)
union all
select n.nspname || '.' || c.relname, 'sequence in a tenant schema' from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('core', 'audit', 'health') and c.relkind = 'S'
union all
select p.oid::regprocedure::text, 'security definer without a pinned search_path' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema')
    and not exists (select 1 from unnest(p.proconfig) s where s = 'search_path=pg_catalog, pg_temp')
union all
select p.oid::regprocedure::text, 'security definer not on the allowlist' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema')
    and p.oid::regprocedure::text not in (select proc from definer_allowed)
union all
select p.oid::regprocedure::text, 'function executable by public' from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('app', 'audit', 'core', 'health', 'search', 'ops')
    and has_function_privilege('public', p.oid, 'execute')
union all
select p.oid::regprocedure::text, 'function owned by ' || pg_get_userbyid(p.proowner) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('app', 'audit', 'core', 'health', 'search', 'ops')
    and pg_get_userbyid(p.proowner) <> 'cell_owner'
union all
select name, runtime.role || ' holds TRUNCATE' from t, runtime
  where has_table_privilege(runtime.role, t.oid, 'TRUNCATE')
union all
select name, runtime.role || ' holds DELETE' from t, runtime
  where has_table_privilege(runtime.role, t.oid, 'DELETE')
    and (name, runtime.role) not in (select name, role from delete_allowed)
union all
select name, runtime.role || ' can update a table without versions' from t, runtime
  where not t.versioned and has_any_column_privilege(runtime.role, t.oid, 'UPDATE')
    and (name, runtime.role) not in (select name, role from unversioned_update_allowed)
union all
select name, runtime.role || ' holds table-wide UPDATE where only columns are granted' from t, runtime
  where has_table_privilege(runtime.role, t.oid, 'UPDATE')
    and ((name, runtime.role) in (select name, role from column_granted)
         or (runtime.role = 'retention' and name <> 'core.tenant_keys'))
union all
select req.name, 'trigger ' || req.trigger || ' missing' from required_trigger req
  where not exists (select 1 from pg_trigger g where g.tgrelid = to_regclass(req.name)
    and g.tgname = req.trigger and not g.tgisinternal)
union all
select c.oid::regclass::text, runtime.role || ' can reach a partition' from pg_class c, runtime
  where c.relispartition and (has_table_privilege(runtime.role, c.oid, 'SELECT')
    or has_table_privilege(runtime.role, c.oid, 'INSERT') or has_table_privilege(runtime.role, c.oid, 'UPDATE'))
union all
select s.nspname, runtime.role || ' has USAGE on ' || s.nspname from pg_namespace s, runtime
  where s.nspname in ('parts', 'search', 'staging', 'ops', 'ext') and has_schema_privilege(runtime.role, s.oid, 'USAGE')
    and not (s.nspname = 'staging' and runtime.role = 'cell_io')
    and not (s.nspname = 'ops' and runtime.role = 'worker')
union all
select n.nspname || '.' || c.relname, runtime.role || ' holds ' || priv || ' outside the tenant schemas'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace, runtime,
       unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as priv
  where c.relkind in ('r', 'p', 'v', 'm', 'f')
    and n.nspname not in ('core', 'audit', 'health', 'pg_catalog', 'information_schema', 'pg_toast', 'staging')
    and not (n.nspname = 'pgboss' and runtime.role = 'worker')
    and not (n.nspname = 'pgboss' and runtime.role = 'app' and priv = 'INSERT' and c.relname like 'job%')
    and has_table_privilege(runtime.role, c.oid, priv)
    and (n.nspname || '.' || c.relname, runtime.role, priv) not in (select name, role, privilege from outside_allowed)
union all
select n.nspname || '.' || c.relname, runtime.role || ' can use a sequence' from pg_class c
  join pg_namespace n on n.oid = c.relnamespace, runtime
  where c.relkind = 'S' and n.nspname not in ('pgboss', 'staging')
    and has_sequence_privilege(runtime.role, c.oid, 'USAGE')
union all
select name, 'entity table lacks ' || col from t,
  unnest(array['id', 'status', 'date_last_modified', 'version', 'metadata', 'created_at']) as col
  where t.versioned
    and not exists (select 1 from pg_attribute a where a.attrelid = t.oid and a.attname = col and not a.attisdropped)
    and not (col = 'id' and exists (select 1 from pg_trigger g join pg_proc p on p.oid = g.tgfoid
      where g.tgrelid = t.oid and p.proname = 'row_meta_keyed'))
union all
select name, 'entity table without row_meta trigger' from t
  where t.versioned
    and not exists (select 1 from pg_trigger g join pg_proc p on p.oid = g.tgfoid
      where g.tgrelid = t.oid and p.proname in ('row_meta', 'row_meta_keyed') and not g.tgisinternal)
union all
select name, 'status column without the tombstone vocabulary' from t
  join pg_attribute a on a.attrelid = t.oid and a.attname = 'status' and not a.attisdropped
  where not exists (select 1 from pg_constraint k where k.conrelid = t.oid and k.contype = 'c'
    and pg_get_constraintdef(k.oid) = 'CHECK ((status = ANY (ARRAY[''active''::text, ''tobedeleted''::text])))')
union all
select name, 'id default is not uuidv7()' from t
  join pg_attribute a on a.attrelid = t.oid and a.attname = 'id' and not a.attisdropped
  left join pg_attrdef d on d.adrelid = t.oid and d.adnum = a.attnum
  where coalesce(pg_get_expr(d.adbin, d.adrelid), '') <> 'uuidv7()'
union all
select coalesce(n.nspname, '(all)'), 'default privileges defined' from pg_default_acl d
  left join pg_namespace n on n.oid = d.defaclnamespace
union all
select c.oid::regclass::text, 'owned by ' || pg_get_userbyid(c.relowner) from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('app', 'core', 'audit', 'health', 'parts', 'search', 'ops')
    and pg_get_userbyid(c.relowner) <> 'cell_owner'
union all
select rolname, 'role bypasses row level security' from pg_roles
  where rolbypassrls and rolname not in ('backup_dump', 'break_glass') and not rolsuper
order by 1, 2
`;

/**
 * Unique keys and exclusion constraints, which must map to a domain code. A
 * unique key that contains the primary key only exists to be referenced (type
 * and period pinning) and can never be violated on its own.
 */
export const CONFLICT_CONSTRAINTS = `
select k.conname as name
from pg_constraint k join pg_namespace n on n.oid = k.connamespace
where n.nspname in ('core', 'audit', 'health') and k.contype in ('u', 'x')
  and not exists (
    select 1 from pg_constraint p
    where p.conrelid = k.conrelid and p.contype = 'p' and p.conkey <@ k.conkey)
union
select i.relname
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_namespace n on n.oid = i.relnamespace
where n.nspname in ('core', 'audit', 'health') and x.indisunique and not x.indisprimary
  and not exists (select 1 from pg_constraint k where k.conindid = x.indexrelid)
order by 1
`;
