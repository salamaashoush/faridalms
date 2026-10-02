-- Guardian links take over what households recorded about where a child
-- lives, before households are dropped. A household membership is more
-- specific than the old lives-with flag, so it wins where both exist.
-- Erased households leave no table to point at; the audit log keeps the
-- erasure. Contact points only ever belonged to people.
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    UPDATE core.user_relationships
    SET residence = CASE WHEN lives_with THEN 'primary' ELSE 'none' END
    WHERE tenant_id = t AND lives_with IS NOT NULL;

    UPDATE core.user_relationships r
    SET residence = h.residence
    FROM (
      SELECT DISTINCT ON (c.user_id, a.user_id)
             c.user_id AS student_user_id, a.user_id AS related_user_id, c.residence
      FROM core.household_members c
      JOIN core.household_members a
        ON a.tenant_id = c.tenant_id AND a.household_id = c.household_id
       AND a.member_kind = 'adult' AND a.status = 'active'
       AND (upper_inf(a.valid_during) OR upper(a.valid_during) > current_date)
      WHERE c.tenant_id = t AND c.member_kind = 'child' AND c.status = 'active'
        AND (upper_inf(c.valid_during) OR upper(c.valid_during) > current_date)
      ORDER BY c.user_id, a.user_id, c.residence
    ) h
    WHERE r.tenant_id = t AND r.student_user_id = h.student_user_id
      AND r.related_user_id = h.related_user_id AND r.status = 'active';

    DELETE FROM core.erasure_items WHERE tenant_id = t AND object_type = 'household';

    DELETE FROM core.contact_points WHERE tenant_id = t AND household_id IS NOT NULL;
  END LOOP;
END $$;
