import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { uuid } from "drizzle-orm/pg-core";

import {
  eraseLedger,
  fk,
  health,
  ledgerProfile,
  pk,
  purposeGate,
} from "./conventions";
import { healthChanges } from "./documents";
import { userRelationships } from "./families";
import { tenants } from "./tenancy";

/** The emergency contact's link a requested change to a phone is about. */
export const contactChanges = health.table.withRLS(
  "contact_changes",
  {
    tenantId: uuid("tenant_id").notNull(),
    changeId: uuid("change_id").notNull(),
    relationshipId: uuid("relationship_id").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("contact_changes", t.tenantId, t.changeId),
    fk("contact_changes", [t.tenantId], [tenants.tenantId]),
    fk(
      "contact_changes",
      [t.tenantId, t.changeId],
      [healthChanges.tenantId, healthChanges.id],
    ),
    fk(
      "contact_changes",
      [t.tenantId, t.relationshipId],
      [userRelationships.tenantId, userRelationships.id],
    ),
    ...ledgerProfile(),
    purposeGate("health"),
    ...eraseLedger(
      sql`exists (select 1 from health.requested_changes c where c.tenant_id = contact_changes.tenant_id and c.id = contact_changes.change_id and app.erasure_approved(c.tenant_id, c.student_user_id))`,
    ),
  ],
);
