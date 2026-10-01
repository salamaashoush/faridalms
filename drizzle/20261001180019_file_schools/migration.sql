ALTER TABLE "core"."files" ADD COLUMN "org_id" uuid;--> statement-breakpoint
CREATE INDEX "files_org_idx" ON "core"."files" ("tenant_id","org_id") WHERE status = 'active';--> statement-breakpoint
-- The column is new and filled below under each tenant's context; checking
-- existing rows here would read them under forced row security with no
-- tenant bound, and new and changed rows are checked all the same.
ALTER TABLE "core"."files" ADD CONSTRAINT "files_tenant_id_org_id_fkey" FOREIGN KEY ("tenant_id","org_id") REFERENCES "core"."orgs"("tenant_id","id") NOT VALID;--> statement-breakpoint
-- Each file's storage counts against a school: the school of the record it
-- belongs to where that record has one, an upload not yet placed the school
-- of its uploader when they belong to one, else the tenant's only school;
-- a previous version counts with the file it was replaced in. Files of a
-- group with several schools that none of these place count against none.
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT tenant_id FROM ops.tenant_registry LOOP
    PERFORM app.begin_unit(t, null, null, null, 'migration', 'operator');

    UPDATE core.files f SET org_id = c.org_id
    FROM core.classes c
    WHERE f.tenant_id = t AND c.tenant_id = t AND f.org_id IS NULL
      AND f.host_type = 'class' AND f.host_id = c.id;

    UPDATE core.files f SET org_id = m.org_id
    FROM core.learning_modules m
    WHERE f.tenant_id = t AND m.tenant_id = t AND f.org_id IS NULL
      AND f.host_type = 'module' AND f.host_id = m.id;

    UPDATE core.files f SET org_id = c.org_id
    FROM core.assignments a
    JOIN core.classes c ON c.tenant_id = a.tenant_id AND c.id = a.class_id
    WHERE f.tenant_id = t AND a.tenant_id = t AND f.org_id IS NULL
      AND f.host_type IN ('assignment', 'assignment_quiz') AND f.host_id = a.id;

    UPDATE core.files f SET org_id = c.org_id
    FROM core.submissions s
    JOIN core.assignments a ON a.tenant_id = s.tenant_id AND a.id = s.assignment_id
    JOIN core.classes c ON c.tenant_id = a.tenant_id AND c.id = a.class_id
    WHERE f.tenant_id = t AND s.tenant_id = t AND f.org_id IS NULL
      AND f.host_type = 'submission' AND f.host_id = s.id;

    UPDATE core.files f SET org_id = c.org_id
    FROM core.submission_attempts p
    JOIN core.submissions s ON s.tenant_id = p.tenant_id AND s.id = p.submission_id
    JOIN core.assignments a ON a.tenant_id = s.tenant_id AND a.id = s.assignment_id
    JOIN core.classes c ON c.tenant_id = a.tenant_id AND c.id = a.class_id
    WHERE f.tenant_id = t AND p.tenant_id = t AND f.org_id IS NULL
      AND f.host_type = 'submission_attempt' AND f.host_id = p.id;

    UPDATE core.files f SET org_id = n.org_id
    FROM core.announcements n
    WHERE f.tenant_id = t AND n.tenant_id = t AND f.org_id IS NULL
      AND f.host_type = 'announcement' AND f.host_id = n.id;

    UPDATE core.files f SET org_id = n.org_id
    FROM core.newsletters n
    WHERE f.tenant_id = t AND n.tenant_id = t AND f.org_id IS NULL
      AND f.host_type = 'newsletter' AND f.host_id = n.id;

    UPDATE core.files f SET org_id = e.org_id
    FROM core.calendar_events e
    WHERE f.tenant_id = t AND e.tenant_id = t AND f.org_id IS NULL
      AND f.host_type = 'calendar_event' AND f.host_id = e.id;

    UPDATE core.files f SET org_id = r.only_school
    FROM (
      SELECT ur.user_id, min(ur.org_id::text)::uuid AS only_school
      FROM core.user_roles ur
      WHERE ur.tenant_id = t AND ur.org_type = 'school' AND ur.status = 'active'
      GROUP BY ur.user_id
      HAVING count(DISTINCT ur.org_id) = 1) r
    WHERE f.tenant_id = t AND f.org_id IS NULL AND f.host_type IS NULL
      AND f.uploaded_by_user_id = r.user_id;

    UPDATE core.files f SET org_id = s.only_school
    FROM (
      SELECT min(o.id::text)::uuid AS only_school FROM core.orgs o
      WHERE o.tenant_id = t AND o.type = 'school' AND o.status = 'active'
      HAVING count(*) = 1) s
    WHERE f.tenant_id = t AND f.org_id IS NULL;

    UPDATE core.files v SET org_id = f.org_id
    FROM core.files f
    WHERE v.tenant_id = t AND f.tenant_id = t AND v.org_id IS NULL
      AND v.host_type = 'file_version' AND v.host_id = f.id;
  END LOOP;
END $$;
