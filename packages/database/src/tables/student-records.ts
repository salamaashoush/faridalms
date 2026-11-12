import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  bytea,
  date,
  index,
  integer,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  eraseAndDelete,
  erasureOf,
  fk,
  health,
  pk,
  purposeGate,
  tenantColumns,
  uq,
} from "./conventions";
import { descriptors } from "./descriptors";
import { files, tenantKeys } from "./files";
import { users } from "./people";
import { recordsRequests } from "./privacy";
import { orgs, tenants } from "./tenancy";

/**
 * A learner's health record: its kind, whether it raises an alert, and its
 * words encrypted, with a report such as a doctor's letter beside it.
 */
export const healthRecords = health.table.withRLS(
  "records",
  {
    ...tenantColumns(),
    studentUserId: uuid("student_user_id").notNull(),
    kindDescriptorId: uuid("kind_descriptor_id").notNull(),
    kindNs: text("kind_ns")
      .notNull()
      .generatedAlwaysAs(sql`'health_record_kind'`),
    hasAlert: boolean("has_alert").notNull().default(false),
    recordedOn: date("recorded_on", { mode: "string" }),
    keyPurpose: text("key_purpose")
      .notNull()
      .generatedAlwaysAs(sql`'health'`),
    keyVersion: integer("key_version").notNull(),
    ciphertext: bytea("ciphertext").notNull(),
    fileId: uuid("file_id"),
    filePurpose: text("file_purpose").notNull().default("health_report"),
    /** Whether a guardian who reads the summary may open the record's report. */
    reportShared: boolean("report_shared").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("records", t.tenantId, t.id),
    ...baseConstraints("records", t, tenants),
    fk("records", [t.tenantId, t.studentUserId], [users.tenantId, users.id]),
    fk(
      "records",
      [t.tenantId, t.kindDescriptorId, t.kindNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "records",
      [t.tenantId, t.keyPurpose, t.keyVersion],
      [tenantKeys.tenantId, tenantKeys.purpose, tenantKeys.keyVersion],
    ),
    fk(
      "records",
      [t.tenantId, t.fileId, t.filePurpose],
      [files.tenantId, files.id, files.purpose],
    ),
    ck(
      "records",
      "ciphertext",
      sql`octet_length(ciphertext) between 29 and 65565`,
    ),
    ck("records", "file_purpose", sql`file_purpose = 'health_report'`),
    ck(
      "records",
      "report_shared",
      sql`file_id is not null or not report_shared`,
    ),
    ck("records", "metadata_empty", sql`metadata = '{}'`),
    index("records_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    purposeGate("health"),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

/**
 * The change someone asked for in a learner's medical summary, carried by
 * their correction request, which holds its deadline and outcome. Nothing
 * here touches the record until the office accepts; the words asked for,
 * the record as the asker read it and any reason for declining are
 * encrypted together. A change to an emergency contact names its link in
 * `contact_changes`.
 */
export const healthChanges = health.table.withRLS(
  "requested_changes",
  {
    ...tenantColumns(),
    requestId: uuid("request_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    requestedByUserId: uuid("requested_by_user_id").notNull(),
    target: text("target").$type<"record" | "contact">().notNull(),
    kindDescriptorId: uuid("kind_descriptor_id"),
    kindNs: text("kind_ns")
      .notNull()
      .generatedAlwaysAs(sql`'health_record_kind'`),
    recordId: uuid("record_id"),
    keyPurpose: text("key_purpose")
      .notNull()
      .generatedAlwaysAs(sql`'health'`),
    keyVersion: integer("key_version").notNull(),
    ciphertext: bytea("ciphertext").notNull(),
    /** A report sent with the change, such as a doctor's letter. */
    fileId: uuid("file_id"),
    filePurpose: text("file_purpose").notNull().default("health_report"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("requested_changes", t.tenantId, t.id),
    ...baseConstraints("requested_changes", t, tenants),
    fk(
      "requested_changes",
      [t.tenantId, t.requestId],
      [recordsRequests.tenantId, recordsRequests.id],
    ),
    fk(
      "requested_changes",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "requested_changes",
      [t.tenantId, t.requestedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "requested_changes",
      [t.tenantId, t.kindDescriptorId, t.kindNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "requested_changes",
      [t.tenantId, t.recordId],
      [healthRecords.tenantId, healthRecords.id],
    ),
    fk(
      "requested_changes",
      [t.tenantId, t.keyPurpose, t.keyVersion],
      [tenantKeys.tenantId, tenantKeys.purpose, tenantKeys.keyVersion],
    ),
    fk(
      "requested_changes",
      [t.tenantId, t.fileId, t.filePurpose],
      [files.tenantId, files.id, files.purpose],
    ),
    uq("requested_changes", t.tenantId, t.requestId),
    ck(
      "requested_changes",
      "file_purpose",
      sql`file_purpose = 'health_report'`,
    ),
    ck(
      "requested_changes",
      "file_target",
      sql`file_id is null or target = 'record'`,
    ),
    ck("requested_changes", "target", sql`target in ('record', 'contact')`),
    ck(
      "requested_changes",
      "shape",
      sql`(target = 'record') = (kind_descriptor_id is not null) and (record_id is null or target = 'record')`,
    ),
    ck(
      "requested_changes",
      "ciphertext",
      sql`octet_length(ciphertext) between 29 and 65565`,
    ),
    ck("requested_changes", "metadata_empty", sql`metadata = '{}'`),
    index("requested_changes_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    purposeGate("health"),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

/**
 * A student's access arrangements at one school: extra time on timed
 * quizzes or none at all, a computer reader, one wrong choice fewer,
 * supervised rest breaks, and days added to every due date. One row a
 * student, changed in place.
 */
export const accessArrangements = core.table.withRLS(
  "access_arrangements",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    extraTime: smallint("extra_time").notNull().default(0),
    unlimitedTime: boolean("unlimited_time").notNull().default(false),
    readAloud: boolean("read_aloud").notNull().default(false),
    fewerChoices: boolean("fewer_choices").notNull().default(false),
    /** Supervised rest breaks: a timed quiz's clock stops while the student rests. */
    restBreaks: boolean("rest_breaks").notNull().default(false),
    extensionDays: smallint("extension_days").notNull().default(0),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("access_arrangements", t.tenantId, t.id),
    ...baseConstraints("access_arrangements", t, tenants),
    fk("access_arrangements", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "access_arrangements",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "access_arrangements",
      "extra_time",
      sql`extra_time in (0, 10, 25, 50, 100)`,
    ),
    ck(
      "access_arrangements",
      "extension_days",
      sql`extension_days between 0 and 14`,
    ),
    uniqueIndex("access_arrangements_key")
      .on(t.tenantId, t.orgId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);
