-- A module's discussion was set class by class, one assignment each. The
-- parts one author set in a module under the same title become one module
-- discussion, sharing the id of the part made first; a second part with
-- that title in the same class stays a discussion of its own. Every part
-- keeps its class, posts, likes, grades and dates, so nothing is lost and
-- no class reads another's posts. The parts take each other's words and
-- reach the module's other classes the next time the discussion or the
-- module is saved.

do $$
declare
  t uuid;
begin
  for t in select tenant_id from ops.tenant_registry loop
    perform app.begin_unit(t, null, null, null, 'migration', 'operator');

    with ranked as (
      select id, module_id, author_user_id, lower(btrim(title)) as titled, created_at,
        row_number() over (
          partition by module_id, author_user_id, lower(btrim(title)), class_id
          order by created_at, id) as in_class
      from core.assignments
      where tenant_id = t and module_id is not null and submission_format = 'discussion'
        and status = 'active'
    ), grouped as (
      select id,
        case when in_class = 1
          then first_value(id) over (
            partition by module_id, author_user_id, titled, in_class = 1
            order by created_at, id)
          else id end as discussion_group
      from ranked
    )
    update core.assignments a set discussion_group = g.discussion_group
    from grouped g
    where a.tenant_id = t and a.id = g.id;
  end loop;
end $$;
