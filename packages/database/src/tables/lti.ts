import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  bytea,
  index,
  jsonb,
  numeric,
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
  ephemeralProfile,
  eraseAndDelete,
  erasureOf,
  fk,
  instant,
  pk,
  tenantColumns,
} from "./conventions";
import { assignments } from "./coursework";
import { learningModules, lessons } from "./learning";
import { users } from "./people";
import { classes } from "./teaching";
import { orgs, tenants } from "./tenancy";

/**
 * An outside tool a school has registered to launch by LTI 1.3: where it
 * starts a sign-in, where launches may be posted back, its keys, and the
 * client and deployment ids the school gave it. A school registers each
 * tool once, so a tool has one deployment there.
 */
export const ltiTools = core.table.withRLS(
  "lti_tools",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    name: text("name").notNull(),
    clientId: text("client_id").notNull(),
    deploymentId: text("deployment_id").notNull(),
    loginUrl: text("login_url").notNull(),
    launchUrl: text("launch_url").notNull(),
    redirectUrls: jsonb("redirect_urls").$type<string[]>().notNull(),
    jwksUrl: text("jwks_url").notNull(),
    deepLinkUrl: text("deep_link_url"),
    sendNames: boolean("send_names").notNull().default(false),
    custom: jsonb("custom")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lti_tools", t.tenantId, t.id),
    ...baseConstraints("lti_tools", t, tenants),
    fk("lti_tools", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("lti_tools", "name", sql`char_length(name) between 1 and 120`),
    ck(
      "lti_tools",
      "urls",
      sql`login_url like 'https://%' and launch_url like 'https://%' and jwks_url like 'https://%' and (deep_link_url is null or deep_link_url like 'https://%') and char_length(login_url) <= 500 and char_length(launch_url) <= 500 and char_length(jwks_url) <= 500 and char_length(coalesce(deep_link_url, '')) <= 500`,
    ),
    ck(
      "lti_tools",
      "redirect_urls",
      sql`jsonb_typeof(redirect_urls) = 'array' and jsonb_array_length(redirect_urls) between 1 and 5`,
    ),
    ck(
      "lti_tools",
      "custom",
      sql`jsonb_typeof(custom) = 'object' and octet_length(custom::text) <= 16384`,
    ),
    ck(
      "lti_tools",
      "ids",
      sql`char_length(client_id) between 1 and 255 and char_length(deployment_id) between 1 and 255`,
    ),
    uniqueIndex("lti_tools_client_key")
      .on(t.tenantId, t.clientId)
      .where(sql`status = 'active'`),
    index("lti_tools_org_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A school's key for signing what it sends tools, published by its id in
 * the school's key set. The private half is kept sealed; a retired key
 * stays published a while so launches signed just before still check.
 */
export const ltiKeys = core.table.withRLS(
  "lti_keys",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    kid: text("kid").notNull(),
    publicJwk: jsonb("public_jwk").$type<Record<string, unknown>>().notNull(),
    sealedPrivateJwk: text("sealed_private_jwk").notNull(),
    retiredAt: instant("retired_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lti_keys", t.tenantId, t.id),
    ...baseConstraints("lti_keys", t, tenants),
    fk("lti_keys", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("lti_keys", "kid", sql`char_length(kid) between 1 and 100`),
    uniqueIndex("lti_keys_kid_key").on(t.tenantId, t.kid),
    uniqueIndex("lti_keys_active_key")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active' and retired_at is null`),
    ...entityProfile(),
  ],
);

/**
 * Values a tool may send once only, kept until they would have expired
 * anyway: a Deep Linking response's nonce, a client assertion's id. Only a
 * digest is kept.
 */
export const ltiReplays = core.table.withRLS(
  "lti_replays",
  {
    tenantId: uuid("tenant_id").notNull(),
    keyHash: bytea("key_hash").notNull(),
    expiresAt: instant("expires_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lti_replays", t.tenantId, t.keyHash),
    fk("lti_replays", [t.tenantId], [tenants.tenantId]),
    ck("lti_replays", "key_hash", sql`octet_length(key_hash) = 32`),
    index("lti_replays_expiry_idx").on(t.tenantId, t.expiresAt),
    ...ephemeralProfile(sql`expires_at < statement_timestamp()`),
  ],
);

const score = (name: string) =>
  numeric(name, { precision: 12, scale: 4, mode: "number" });

/**
 * A column of grades a tool reports into, LTI's line item: in one course,
 * a lesson's module or a class, and often for one link to the tool in a
 * lesson or brief there. A link's own column, which the content picked
 * for it asked for, is declared, and made when the link is first launched.
 */
export const ltiLineItems = core.table.withRLS(
  "lti_line_items",
  {
    ...tenantColumns(),
    toolId: uuid("tool_id").notNull(),
    moduleId: uuid("module_id"),
    classId: uuid("class_id"),
    lessonId: uuid("lesson_id"),
    assignmentId: uuid("assignment_id"),
    linkId: uuid("link_id"),
    declared: boolean("declared").notNull().default(false),
    label: text("label").notNull(),
    scoreMaximum: score("score_maximum").notNull(),
    resourceId: text("resource_id"),
    tag: text("tag"),
    startsAt: instant("starts_at"),
    endsAt: instant("ends_at"),
    gradesReleased: boolean("grades_released"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lti_line_items", t.tenantId, t.id),
    ...baseConstraints("lti_line_items", t, tenants),
    fk(
      "lti_line_items",
      [t.tenantId, t.toolId],
      [ltiTools.tenantId, ltiTools.id],
    ),
    fk(
      "lti_line_items",
      [t.tenantId, t.moduleId],
      [learningModules.tenantId, learningModules.id],
    ),
    fk(
      "lti_line_items",
      [t.tenantId, t.classId],
      [classes.tenantId, classes.id],
    ),
    fk(
      "lti_line_items",
      [t.tenantId, t.lessonId],
      [lessons.tenantId, lessons.id],
    ),
    fk(
      "lti_line_items",
      [t.tenantId, t.assignmentId],
      [assignments.tenantId, assignments.id],
    ),
    ck(
      "lti_line_items",
      "course",
      sql`num_nonnulls(module_id, class_id) = 1
        and (lesson_id is null or module_id is not null)
        and (assignment_id is null or class_id is not null)`,
    ),
    ck(
      "lti_line_items",
      "link",
      sql`(link_id is null) = (lesson_id is null and assignment_id is null)
        and (not declared or link_id is not null)`,
    ),
    ck(
      "lti_line_items",
      "fields",
      sql`char_length(label) between 1 and 200 and score_maximum > 0
        and char_length(coalesce(resource_id, '')) <= 255 and char_length(coalesce(tag, '')) <= 255
        and (starts_at is null or ends_at is null or starts_at <= ends_at)`,
    ),
    uniqueIndex("lti_line_items_lesson_link_key")
      .on(t.tenantId, t.toolId, t.lessonId, t.linkId)
      .where(sql`declared and lesson_id is not null and status = 'active'`),
    uniqueIndex("lti_line_items_assignment_link_key")
      .on(t.tenantId, t.toolId, t.assignmentId, t.linkId)
      .where(sql`declared and assignment_id is not null and status = 'active'`),
    index("lti_line_items_module_idx")
      .on(t.tenantId, t.toolId, t.moduleId)
      .where(sql`module_id is not null and status = 'active'`),
    index("lti_line_items_class_idx")
      .on(t.tenantId, t.toolId, t.classId)
      .where(sql`class_id is not null and status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A student's latest score in a tool's column, as the tool last sent it,
 * with how far the student and the marking have got; a score the tool sent
 * before the one kept is ignored, as LTI asks.
 */
export const ltiScores = core.table.withRLS(
  "lti_scores",
  {
    ...tenantColumns(),
    lineItemId: uuid("line_item_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    scoreGiven: score("score_given"),
    scoreMaximum: score("score_maximum"),
    comment: text("comment"),
    activityProgress: text("activity_progress").notNull(),
    gradingProgress: text("grading_progress").notNull(),
    /** When the tool says the score changed, which orders its updates. */
    scoredAt: instant("scored_at").notNull(),
    scoringUserId: uuid("scoring_user_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lti_scores", t.tenantId, t.id),
    ...baseConstraints("lti_scores", t, tenants),
    fk(
      "lti_scores",
      [t.tenantId, t.lineItemId],
      [ltiLineItems.tenantId, ltiLineItems.id],
    ),
    fk("lti_scores", [t.tenantId, t.studentUserId], [users.tenantId, users.id]),
    fk("lti_scores", [t.tenantId, t.scoringUserId], [users.tenantId, users.id]),
    ck(
      "lti_scores",
      "score",
      sql`(score_given is null or (score_given >= 0 and score_maximum > 0))
        and char_length(coalesce(comment, '')) <= 4000`,
    ),
    ck(
      "lti_scores",
      "progress",
      sql`activity_progress in ('Initialized', 'Started', 'InProgress', 'Submitted', 'Completed')
        and grading_progress in ('FullyGraded', 'Pending', 'PendingManual', 'Failed', 'NotReady')`,
    ),
    uniqueIndex("lti_scores_key")
      .on(t.tenantId, t.lineItemId, t.studentUserId)
      .where(sql`status = 'active'`),
    index("lti_scores_student_idx").on(t.tenantId, t.studentUserId),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);
