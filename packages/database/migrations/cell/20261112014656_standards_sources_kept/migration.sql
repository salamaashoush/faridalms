-- Frameworks now come from a school or from one of two ready-made
-- frameworks, the EYFS early learning goals and Development Matters, whose
-- identifiers bring a school's copy back when it is added again. The IB
-- concepts and CASE imports are gone, so the identifiers they left on a
-- school's frameworks and standards name a source nothing adds any more:
-- they are cleared, and those frameworks stay as the school's own.

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');

    update core.standards s set source_identifier = null
    from core.standard_frameworks f
    where s.tenant_id = t and f.tenant_id = t and f.id = s.framework_id
      and s.source_identifier is not null
      and f.source_identifier is distinct from '701c25d0-9f28-45fb-a533-1ded3c949259'::uuid
      and f.source_identifier is distinct from 'f5dc4454-7840-4b3f-a825-d733f930ff79'::uuid;

    update core.standard_frameworks set source_identifier = null
    where tenant_id = t and source_identifier is not null
      and source_identifier not in ('701c25d0-9f28-45fb-a533-1ded3c949259'::uuid, 'f5dc4454-7840-4b3f-a825-d733f930ff79'::uuid);
  end loop;
end $$;
