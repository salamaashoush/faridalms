import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import type { CellTransaction } from "../context";

type Tx = CellTransaction;

export interface ToolRow {
  id: string;
  version: number;
  name: string;
  clientId: string;
  deploymentId: string;
  loginUrl: string;
  launchUrl: string;
  redirectUrls: string[];
  jwksUrl: string;
  deepLinkUrl: string | null;
  sendNames: boolean;
  custom: Record<string, string>;
}

type ToolRecord = {
  id: string;
  version: number;
  name: string;
  client_id: string;
  deployment_id: string;
  login_url: string;
  launch_url: string;
  redirect_urls: string[];
  jwks_url: string;
  deep_link_url: string | null;
  send_names: boolean;
  custom: Record<string, string>;
};

const toolOf = (row: ToolRecord): ToolRow => ({
  id: row.id,
  version: row.version,
  name: row.name,
  clientId: row.client_id,
  deploymentId: row.deployment_id,
  loginUrl: row.login_url,
  launchUrl: row.launch_url,
  redirectUrls: row.redirect_urls,
  jwksUrl: row.jwks_url,
  deepLinkUrl: row.deep_link_url,
  sendNames: row.send_names,
  custom: row.custom,
});

const toolColumns = sql`id, version, name, client_id, deployment_id, login_url, launch_url,
  redirect_urls, jwks_url, deep_link_url, send_names, custom`;

/** A school's outside tools, by name. */
export async function toolsOf(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<ToolRow[]> {
  const rows = await tx.execute<ToolRecord>(sql`
    select ${toolColumns} from core.lti_tools
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active'
    order by name, id`);
  return rows.map(toolOf);
}

export async function toolById(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<ToolRow | null> {
  const [row] = await tx.execute<ToolRecord>(sql`
    select ${toolColumns} from core.lti_tools
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and status = 'active'`);
  return row ? toolOf(row) : null;
}

/** A school's tool by the client id it calls itself by. */
export async function toolByClientId(
  tx: Tx,
  input: { tenantId: string; orgId: string; clientId: string },
): Promise<ToolRow | null> {
  const [row] = await tx.execute<ToolRecord>(sql`
    select ${toolColumns} from core.lti_tools
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and client_id = ${input.clientId} and status = 'active'`);
  return row ? toolOf(row) : null;
}

export interface ToolFields {
  name: string;
  loginUrl: string;
  launchUrl: string;
  redirectUrls: string[];
  jwksUrl: string;
  deepLinkUrl: string | null;
  sendNames: boolean;
  custom: Record<string, string>;
}

/** Registers a tool, with the client and deployment ids the school gives it. */
export async function insertTool(
  tx: Tx,
  input: ToolFields & {
    tenantId: string;
    orgId: string;
    clientId: string;
    deploymentId: string;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.lti_tools (tenant_id, org_id, name, client_id, deployment_id, login_url,
      launch_url, redirect_urls, jwks_url, deep_link_url, send_names, custom)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.name}, ${input.clientId},
      ${input.deploymentId}, ${input.loginUrl}, ${input.launchUrl},
      ${JSON.stringify(input.redirectUrls)}::text::jsonb, ${input.jwksUrl}, ${input.deepLinkUrl},
      ${input.sendNames}, ${JSON.stringify(input.custom)}::text::jsonb)
    returning id, version`);
  if (!row) throw new Error("tool was not registered");
  return row;
}

/** Null when the tool changed since the version the caller read. */
export async function updateTool(
  tx: Tx,
  input: ToolFields & {
    tenantId: string;
    orgId: string;
    id: string;
    expectedVersion: number;
  },
): Promise<{ version: number } | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.lti_tools
    set name = ${input.name}, login_url = ${input.loginUrl}, launch_url = ${input.launchUrl},
        redirect_urls = ${JSON.stringify(input.redirectUrls)}::text::jsonb,
        jwks_url = ${input.jwksUrl}, deep_link_url = ${input.deepLinkUrl},
        send_names = ${input.sendNames}, custom = ${JSON.stringify(input.custom)}::text::jsonb
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row ?? null;
}

export async function removeTool(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.lti_tools set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and status = 'active'
    returning id`);
  return rows.length > 0;
}

export interface KeyRow {
  kid: string;
  publicJwk: Record<string, unknown>;
  sealedPrivateJwk: string;
}

/** The key a school signs with now, if it has made one. */
export async function signingKey(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<KeyRow | null> {
  const [row] = await tx.execute<{
    kid: string;
    public_jwk: Record<string, unknown>;
    sealed_private_jwk: string;
  }>(sql`
    select kid, public_jwk, sealed_private_jwk from core.lti_keys
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active' and retired_at is null`);
  return row
    ? {
        kid: row.kid,
        publicJwk: row.public_jwk,
        sealedPrivateJwk: row.sealed_private_jwk,
      }
    : null;
}

/**
 * Keeps a school's new signing key, unless another request made one first;
 * the key that stands is returned either way.
 */
export async function keepSigningKey(
  tx: Tx,
  input: KeyRow & { tenantId: string; orgId: string },
): Promise<KeyRow> {
  await tx.execute(sql`
    insert into core.lti_keys (tenant_id, org_id, kid, public_jwk, sealed_private_jwk)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.kid},
      ${JSON.stringify(input.publicJwk)}::text::jsonb, ${input.sealedPrivateJwk})
    on conflict (tenant_id, org_id) where status = 'active' and retired_at is null
    do nothing`);
  const kept = await signingKey(tx, input);
  if (!kept) throw new Error("signing key was not kept");
  return kept;
}

/**
 * The public keys a school publishes: the one it signs with, and those
 * retired within the week, so what was signed just before still checks.
 */
export async function publishedKeys(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<Record<string, unknown>[]> {
  const rows = await tx.execute<{ public_jwk: Record<string, unknown> }>(sql`
    select public_jwk from core.lti_keys
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active'
      and (retired_at is null or retired_at > statement_timestamp() - interval '7 days')
    order by created_at desc`);
  return rows.map((row) => row.public_jwk);
}

/**
 * Records a value a tool may use once; false when it was used already and
 * has not yet expired.
 */
export async function useOnce(
  tx: Tx,
  input: { tenantId: string; key: string; expiresAt: Date },
): Promise<boolean> {
  const digest = createHash("sha256").update(input.key).digest();
  const rows = await tx.execute(sql`
    insert into core.lti_replays (tenant_id, key_hash, expires_at)
    values (${input.tenantId}::uuid, ${digest}, ${input.expiresAt.toISOString()}::timestamptz)
    on conflict (tenant_id, key_hash) do nothing
    returning 1`);
  return rows.length > 0;
}

/** The course a tool's column of grades sits in: a lesson's module or a class. */
export type LtiCourse = { moduleId: string } | { classId: string };

/** The lesson or brief a column belongs to, with the link to the tool there. */
export interface LtiLinkPlace {
  lessonId?: string;
  assignmentId?: string;
  linkId: string;
}

export interface LineItemRow {
  id: string;
  toolId: string;
  course: LtiCourse;
  link: LtiLinkPlace | null;
  declared: boolean;
  label: string;
  scoreMaximum: number;
  resourceId: string | null;
  tag: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  gradesReleased: boolean | null;
}

type LineItemRecord = {
  id: string;
  tool_id: string;
  module_id: string | null;
  class_id: string | null;
  lesson_id: string | null;
  assignment_id: string | null;
  link_id: string | null;
  declared: boolean;
  label: string;
  score_maximum: string;
  resource_id: string | null;
  tag: string | null;
  starts_at: Date | string | null;
  ends_at: Date | string | null;
  grades_released: boolean | null;
};

const when = (value: Date | string | null) =>
  value === null ? null : new Date(value);

const lineItemOf = (row: LineItemRecord): LineItemRow => ({
  id: row.id,
  toolId: row.tool_id,
  course: row.module_id
    ? { moduleId: row.module_id }
    : { classId: row.class_id ?? "" },
  link: row.link_id
    ? {
        ...(row.lesson_id ? { lessonId: row.lesson_id } : {}),
        ...(row.assignment_id ? { assignmentId: row.assignment_id } : {}),
        linkId: row.link_id,
      }
    : null,
  declared: row.declared,
  label: row.label,
  scoreMaximum: Number(row.score_maximum),
  resourceId: row.resource_id,
  tag: row.tag,
  startsAt: when(row.starts_at),
  endsAt: when(row.ends_at),
  gradesReleased: row.grades_released,
});

const lineItemColumns = sql`i.id, i.tool_id, i.module_id, i.class_id, i.lesson_id, i.assignment_id,
  i.link_id, i.declared, i.label, i.score_maximum, i.resource_id, i.tag, i.starts_at, i.ends_at,
  i.grades_released`;

const inCourse = (course: LtiCourse) =>
  "moduleId" in course
    ? sql`i.module_id = ${course.moduleId}::uuid`
    : sql`i.class_id = ${course.classId}::uuid`;

/** A tool's column of grades, with the school its tool belongs to checked. */
export async function lineItemById(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<LineItemRow | null> {
  const [row] = await tx.execute<LineItemRecord>(sql`
    select ${lineItemColumns} from core.lti_line_items i
    join core.lti_tools t on t.tenant_id = i.tenant_id and t.id = i.tool_id
    where i.tenant_id = ${input.tenantId}::uuid and i.id = ${input.id}::uuid
      and i.status = 'active' and t.org_id = ${input.orgId}::uuid`);
  return row ? lineItemOf(row) : null;
}

/**
 * A tool's columns in a course, oldest first from after the one named, at
 * most as many as asked: those for a link, for one of the tool's own
 * resources, or with a tag, when asked.
 */
export async function lineItemsIn(
  tx: Tx,
  input: {
    tenantId: string;
    toolId: string;
    course: LtiCourse;
    link?: LtiLinkPlace;
    resourceId?: string;
    tag?: string;
    after?: string;
    limit: number;
  },
): Promise<LineItemRow[]> {
  const link = input.link;
  const rows = await tx.execute<LineItemRecord>(sql`
    select ${lineItemColumns} from core.lti_line_items i
    where i.tenant_id = ${input.tenantId}::uuid and i.tool_id = ${input.toolId}::uuid
      and ${inCourse(input.course)} and i.status = 'active'
      ${link ? sql`and i.link_id = ${link.linkId}::uuid and coalesce(i.lesson_id, i.assignment_id) = ${link.lessonId ?? link.assignmentId ?? null}::uuid` : sql``}
      ${input.resourceId === undefined ? sql`` : sql`and i.resource_id = ${input.resourceId}`}
      ${input.tag === undefined ? sql`` : sql`and i.tag = ${input.tag}`}
      ${input.after ? sql`and i.id > ${input.after}::uuid` : sql``}
    order by i.id
    limit ${input.limit}`);
  return rows.map(lineItemOf);
}

export interface LineItemFields {
  label: string;
  scoreMaximum: number;
  resourceId: string | null;
  tag: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  gradesReleased: boolean | null;
}

const isoOrNull = (value: Date | null) => value?.toISOString() ?? null;

export async function insertLineItem(
  tx: Tx,
  input: {
    tenantId: string;
    toolId: string;
    course: LtiCourse;
    link: LtiLinkPlace | null;
  } & LineItemFields,
): Promise<string> {
  const course = input.course;
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.lti_line_items (tenant_id, tool_id, module_id, class_id, lesson_id,
      assignment_id, link_id, label, score_maximum, resource_id, tag, starts_at, ends_at,
      grades_released)
    values (${input.tenantId}::uuid, ${input.toolId}::uuid,
      ${"moduleId" in course ? course.moduleId : null}::uuid,
      ${"classId" in course ? course.classId : null}::uuid,
      ${input.link?.lessonId ?? null}::uuid, ${input.link?.assignmentId ?? null}::uuid,
      ${input.link?.linkId ?? null}::uuid, ${input.label}, ${input.scoreMaximum},
      ${input.resourceId}, ${input.tag}, ${isoOrNull(input.startsAt)}::timestamptz,
      ${isoOrNull(input.endsAt)}::timestamptz, ${input.gradesReleased})
    returning id`);
  if (!row) throw new Error("line item not inserted");
  return row.id;
}

/**
 * The column a link's picked content asked for, made the first time it is
 * needed; one launch racing another finds the column the other made.
 */
export async function declaredLineItem(
  tx: Tx,
  input: {
    tenantId: string;
    toolId: string;
    course: LtiCourse;
    link: LtiLinkPlace;
    label: string;
    scoreMaximum: number;
    resourceId: string | null;
    tag: string | null;
  },
): Promise<string> {
  const { link, course } = input;
  const host = link.lessonId
    ? sql`lesson_id = ${link.lessonId}::uuid`
    : sql`assignment_id = ${link.assignmentId ?? null}::uuid`;
  const find = () =>
    tx.execute<{ id: string }>(sql`
      select id from core.lti_line_items
      where tenant_id = ${input.tenantId}::uuid and tool_id = ${input.toolId}::uuid
        and ${host} and link_id = ${link.linkId}::uuid and declared and status = 'active'`);
  const [found] = await find();
  if (found) return found.id;
  const [made] = await tx.execute<{ id: string }>(sql`
    insert into core.lti_line_items (tenant_id, tool_id, module_id, class_id, lesson_id,
      assignment_id, link_id, declared, label, score_maximum, resource_id, tag)
    values (${input.tenantId}::uuid, ${input.toolId}::uuid,
      ${"moduleId" in course ? course.moduleId : null}::uuid,
      ${"classId" in course ? course.classId : null}::uuid,
      ${link.lessonId ?? null}::uuid, ${link.assignmentId ?? null}::uuid, ${link.linkId}::uuid,
      true, ${input.label}, ${input.scoreMaximum}, ${input.resourceId}, ${input.tag})
    on conflict do nothing
    returning id`);
  if (made) return made.id;
  const [raced] = await find();
  if (!raced) throw new Error("declared line item not found");
  return raced.id;
}

/** Replaces a column's fields, as a tool's update does; its course and link stay. */
export async function updateLineItem(
  tx: Tx,
  input: { tenantId: string; id: string } & LineItemFields,
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.lti_line_items set label = ${input.label},
      score_maximum = ${input.scoreMaximum}, resource_id = ${input.resourceId},
      tag = ${input.tag}, starts_at = ${isoOrNull(input.startsAt)}::timestamptz,
      ends_at = ${isoOrNull(input.endsAt)}::timestamptz, grades_released = ${input.gradesReleased}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'
    returning id`);
  return rows.length > 0;
}

export async function removeLineItem(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.lti_line_items set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'
    returning id`);
  return rows.length > 0;
}

/**
 * Whether someone learns in a course today: a student of the class, or of
 * a class the module is set for.
 */
export async function learnsIn(
  tx: Tx,
  input: { tenantId: string; course: LtiCourse; userId: string },
): Promise<boolean> {
  const classes =
    "classId" in input.course
      ? sql`select ${input.course.classId}::uuid`
      : sql`select x.class_id from core.module_classes x
          where x.tenant_id = ${input.tenantId}::uuid
            and x.module_id = ${input.course.moduleId}::uuid and x.status = 'active'`;
  const [row] = await tx.execute<{ learns: boolean }>(sql`
    select exists (
      select 1 from core.enrollments e
      join core.classes c on c.tenant_id = e.tenant_id
        and e.class_id = coalesce(c.homeroom_class_id, c.id)
      where e.tenant_id = ${input.tenantId}::uuid and e.user_id = ${input.userId}::uuid
        and e.role = 'student' and e.status = 'active' and e.valid_during @> current_date
        and c.id in (${classes})) as learns`);
  return row?.learns ?? false;
}

export type ActivityProgress =
  | "Initialized"
  | "Started"
  | "InProgress"
  | "Submitted"
  | "Completed";
export type GradingProgress =
  | "FullyGraded"
  | "Pending"
  | "PendingManual"
  | "Failed"
  | "NotReady";

/**
 * Keeps a tool's score for a student unless one it sent later is kept
 * already; whether it was kept. A scorer the school does not know is
 * left out.
 */
export async function keepScore(
  tx: Tx,
  input: {
    tenantId: string;
    lineItemId: string;
    studentUserId: string;
    scoreGiven: number | null;
    scoreMaximum: number | null;
    comment: string | null;
    activityProgress: ActivityProgress;
    gradingProgress: GradingProgress;
    scoredAt: Date;
    scoringUserId: string | null;
  },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    insert into core.lti_scores (tenant_id, line_item_id, student_user_id, score_given,
      score_maximum, comment, activity_progress, grading_progress, scored_at, scoring_user_id)
    values (${input.tenantId}::uuid, ${input.lineItemId}::uuid, ${input.studentUserId}::uuid,
      ${input.scoreGiven}, ${input.scoreMaximum}, ${input.comment}, ${input.activityProgress},
      ${input.gradingProgress}, ${input.scoredAt.toISOString()}::timestamptz,
      (select u.id from core.users u where u.tenant_id = ${input.tenantId}::uuid
        and u.id = ${input.scoringUserId}::uuid))
    on conflict (tenant_id, line_item_id, student_user_id) where status = 'active'
    do update set score_given = excluded.score_given, score_maximum = excluded.score_maximum,
      comment = excluded.comment, activity_progress = excluded.activity_progress,
      grading_progress = excluded.grading_progress, scored_at = excluded.scored_at,
      scoring_user_id = excluded.scoring_user_id
    where core.lti_scores.scored_at < excluded.scored_at
    returning id`);
  return rows.length > 0;
}

export interface ScoreRow {
  studentUserId: string;
  scoreGiven: number | null;
  scoreMaximum: number | null;
  comment: string | null;
  activityProgress: ActivityProgress;
  gradingProgress: GradingProgress;
  scoredAt: Date;
  scoringUserId: string | null;
}

type ScoreRecord = {
  student_user_id: string;
  score_given: string | null;
  score_maximum: string | null;
  comment: string | null;
  activity_progress: ActivityProgress;
  grading_progress: GradingProgress;
  scored_at: Date | string;
  scoring_user_id: string | null;
};

const scoreOf = (row: ScoreRecord): ScoreRow => ({
  studentUserId: row.student_user_id,
  scoreGiven: row.score_given === null ? null : Number(row.score_given),
  scoreMaximum: row.score_maximum === null ? null : Number(row.score_maximum),
  comment: row.comment,
  activityProgress: row.activity_progress,
  gradingProgress: row.grading_progress,
  scoredAt: new Date(row.scored_at),
  scoringUserId: row.scoring_user_id,
});

/** The scores kept in a column, by student, from after the one named. */
export async function scoresIn(
  tx: Tx,
  input: {
    tenantId: string;
    lineItemId: string;
    studentUserId?: string;
    after?: string;
    limit: number;
  },
): Promise<ScoreRow[]> {
  const rows = await tx.execute<ScoreRecord>(sql`
    select student_user_id, score_given, score_maximum, comment, activity_progress,
      grading_progress, scored_at, scoring_user_id
    from core.lti_scores
    where tenant_id = ${input.tenantId}::uuid and line_item_id = ${input.lineItemId}::uuid
      and status = 'active'
      ${input.studentUserId ? sql`and student_user_id = ${input.studentUserId}::uuid` : sql``}
      ${input.after ? sql`and student_user_id > ${input.after}::uuid` : sql``}
    order by student_user_id
    limit ${input.limit}`);
  return rows.map(scoreOf);
}
