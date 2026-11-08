import type { CellTransaction } from "@faridalms/database/context";
import type {
  LineItemRow,
  LtiCourse,
  LtiLinkPlace,
  ToolRow,
} from "@faridalms/database/stores/lti";

import { assignmentById } from "@faridalms/database/stores/coursework";
import {
  documentOf,
  publishedVersion,
} from "@faridalms/database/stores/documents";
import { lessonById } from "@faridalms/database/stores/learning";
import {
  insertLineItem,
  keepScore,
  learnsIn,
  lineItemById,
  lineItemsIn,
  removeLineItem,
  scoresIn,
  toolByClientId,
  toolById,
  updateLineItem,
  useOnce,
} from "@faridalms/database/stores/lti";
import {
  agsLineItemSchema,
  agsScoreSchema,
  LTI_AGS_CLAIM,
  LTI_AGS_SCOPES,
  ltiScopesOf,
} from "@faridalms/domain/lti";
import { decodeJwt, jwtVerify } from "jose";
import * as v from "valibot";

import type { SchoolContext } from "../core/context";

import { toolKeys } from "./keys";
import {
  findLink,
  issuerOf,
  refused,
  resourceLinkId,
  secretsFor,
} from "./shared";

/** How long a tool's access token lasts, as LTI recommends. */
const TOKEN_SECONDS = 3600;
const JWT_BEARER = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const ID = /^[0-9a-f-]{36}$/;

const MEDIA = {
  lineItem: "application/vnd.ims.lis.v2.lineitem+json",
  lineItems: "application/vnd.ims.lis.v2.lineitemcontainer+json",
  results: "application/vnd.ims.lis.v2.resultcontainer+json",
} as const;

/** A tool's access token, which names the tool and the scopes it was given. */
export interface AccessToken {
  kind: "access";
  toolId: string;
  scopes: string[];
}

/** The access token a tool's service call carries, when it is one this cell gave. */
export async function bearerOf(
  context: SchoolContext,
  request: Request,
): Promise<AccessToken | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? await secretsFor(context).read<AccessToken>(header.slice(7))
    : null;
  return token?.kind === "access" ? token : null;
}

/**
 * Whether a token lets its tool use a scope: given when the token was
 * issued, and still among the services the school lets the tool use.
 */
export const grants = (token: AccessToken, tool: ToolRow, scope: string) =>
  token.scopes.includes(scope) && ltiScopesOf(tool).includes(scope);

const noStore = { "cache-control": "no-store", pragma: "no-cache" };

export const asSystem = (context: SchoolContext) => ({
  tenantId: context.school.tenantId,
  requestId: context.requestId,
  actor: { kind: "system" as const },
});

export const courseKey = (course: LtiCourse): [string, string] =>
  "moduleId" in course
    ? ["module", course.moduleId]
    : ["class", course.classId];

/**
 * Where a tool finds its columns of grades in a course. The address carries
 * a tag only this cell can make, so a tool reaches only the courses it was
 * launched in.
 */
export async function lineItemsUrl(
  context: SchoolContext,
  toolId: string,
  course: LtiCourse,
) {
  const [kind, id] = courseKey(course);
  const tag = await secretsFor(context).tag(`course:${toolId}:${kind}:${id}`);
  return `${issuerOf(context.school)}/ags/${kind}/${id}/${tag}/lineitems`;
}

const lineItemUrl = (context: SchoolContext, id: string) =>
  `${issuerOf(context.school)}/ags/lineitems/${id}`;

/**
 * What a launch tells a tool of the course's grades: where its columns are,
 * the link's own column when it has one, and what the tool may do there.
 */
export async function gradesClaim(
  context: SchoolContext,
  toolId: string,
  course: LtiCourse,
  lineItemId: string | null,
) {
  return {
    [LTI_AGS_CLAIM]: {
      scope: Object.values(LTI_AGS_SCOPES),
      lineitems: await lineItemsUrl(context, toolId, course),
      ...(lineItemId ? { lineitem: lineItemUrl(context, lineItemId) } : {}),
    },
  };
}

/**
 * A student's score in a tool's column, out of the column's own maximum,
 * however the tool counted it; none when the tool sent none.
 */
export function resultOf(
  score: { scoreGiven: number | null; scoreMaximum: number | null },
  column: { scoreMaximum: number },
): number | null {
  return score.scoreGiven === null || !score.scoreMaximum
    ? null
    : (score.scoreGiven / score.scoreMaximum) * column.scoreMaximum;
}

const oauthError = (error: string, status = 400) =>
  Response.json({ error }, { status, headers: noStore });

/**
 * The school's token endpoint: a tool proves who it is with an assertion
 * signed by its key, used once, and is given a token for the grade
 * services it asked for, for an hour.
 */
export async function issueToken(
  context: SchoolContext,
  request: Request,
): Promise<Response> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/x-www-form-urlencoded"))
    return oauthError("invalid_request");
  const params = new URLSearchParams(await request.text());
  if (params.get("grant_type") !== "client_credentials")
    return oauthError("unsupported_grant_type");
  if (params.get("client_assertion_type") !== JWT_BEARER)
    return oauthError("invalid_request");
  const assertion = params.get("client_assertion") ?? "";
  let clientId = "";
  try {
    clientId = decodeJwt(assertion).sub ?? "";
  } catch {
    return oauthError("invalid_client", 401);
  }
  const school = {
    tenantId: context.school.tenantId,
    orgId: context.school.schoolId,
  };
  const tool = await context.cell.withTenant(asSystem(context), "read", (tx) =>
    toolByClientId(tx, { ...school, clientId }),
  );
  if (!tool) return oauthError("invalid_client", 401);
  const payload = await jwtVerify(assertion, toolKeys(tool.jwksUrl), {
    audience: `${issuerOf(context.school)}/token`,
    subject: tool.clientId,
    algorithms: ["RS256"],
    requiredClaims: ["iat", "exp", "jti"],
    clockTolerance: 60,
  }).then(
    (verified) => verified.payload,
    () => null,
  );
  const now = Math.floor(Date.now() / 1000);
  // An assertion meant to last longer than a token would be kept as long
  // to refuse it again, so it is refused now.
  if (
    !payload ||
    typeof payload.jti !== "string" ||
    !payload.exp ||
    payload.exp > now + TOKEN_SECONDS
  )
    return oauthError("invalid_client", 401);
  const jti = payload.jti;
  const expiresAt = new Date((payload.exp + 60) * 1000);
  const fresh = await context.cell.withTenant(
    asSystem(context),
    "write",
    (tx) =>
      useOnce(tx, {
        tenantId: school.tenantId,
        key: `assertion:${tool.id}:${jti}`,
        expiresAt,
      }),
  );
  if (!fresh) return oauthError("invalid_client", 401);
  const known = ltiScopesOf(tool);
  const scopes = [
    ...new Set((params.get("scope") ?? "").split(" ").filter(Boolean)),
  ].filter((scope) => known.includes(scope));
  if (scopes.length === 0) return oauthError("invalid_scope");
  const token: AccessToken = { kind: "access", toolId: tool.id, scopes };
  return Response.json(
    {
      access_token: await secretsFor(context).sign(token, TOKEN_SECONDS),
      token_type: "Bearer",
      expires_in: TOKEN_SECONDS,
      scope: scopes.join(" "),
    },
    { headers: noStore },
  );
}

/** What a service call is for, read from its address. */
type Target =
  | { kind: "lineItems"; course: LtiCourse; tag: string }
  | { kind: "lineItem"; id: string }
  | { kind: "scores"; id: string }
  | { kind: "results"; id: string; userId?: string };

function targetOf(pathname: string): Target | null {
  const parts = pathname.slice("/lti/ags/".length).split("/");
  const [first, second, third, fourth] = parts;
  if (
    parts.length === 4 &&
    (first === "module" || first === "class") &&
    ID.test(second ?? "") &&
    third &&
    fourth === "lineitems"
  )
    return {
      kind: "lineItems",
      course:
        first === "module"
          ? { moduleId: second ?? "" }
          : { classId: second ?? "" },
      tag: third,
    };
  if (first !== "lineitems" || !ID.test(second ?? "")) return null;
  const id = second ?? "";
  if (parts.length === 2) return { kind: "lineItem", id };
  if (parts.length === 3 && third === "scores") return { kind: "scores", id };
  if (parts.length === 3 && third === "results") return { kind: "results", id };
  if (parts.length === 4 && third === "results" && ID.test(fourth ?? ""))
    return { kind: "results", id, userId: fourth };
  return null;
}

export const unauthorized = () =>
  new Response(JSON.stringify({ error: "invalid_token" }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": 'Bearer error="invalid_token"',
    },
  });

const json = (value: unknown, type: string, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": type, ...headers },
  });

/** A column as a tool reads it. */
function lineItemJson(context: SchoolContext, item: LineItemRow) {
  const host = item.link?.lessonId ?? item.link?.assignmentId;
  return {
    id: lineItemUrl(context, item.id),
    label: item.label,
    scoreMaximum: item.scoreMaximum,
    ...(item.resourceId === null ? {} : { resourceId: item.resourceId }),
    ...(item.tag === null ? {} : { tag: item.tag }),
    ...(item.link && host
      ? { resourceLinkId: resourceLinkId(host, item.link.linkId) }
      : {}),
    startDateTime: item.startsAt?.toISOString() ?? null,
    endDateTime: item.endsAt?.toISOString() ?? null,
    ...(item.gradesReleased === null
      ? {}
      : { gradesReleased: item.gradesReleased }),
    ...(item.submissionReview
      ? { submissionReview: item.submissionReview }
      : {}),
  };
}

/** How many a page holds, as the tool asked, within the school's own limit. */
export const pageSize = (url: URL) => {
  const asked = Number(url.searchParams.get("limit"));
  return Number.isInteger(asked) && asked > 0 ? Math.min(asked, 500) : 100;
};

/** The address of the page after this one, which keeps the filters asked for. */
export function nextLink(context: SchoolContext, url: URL, after: string) {
  const search = new URLSearchParams(url.searchParams);
  search.set("after", after);
  const path = url.pathname.slice("/lti".length);
  return {
    link: `<${issuerOf(context.school)}${path}?${search}>; rel="next"`,
  };
}

/**
 * A link a tool names in a course as `resource_link_id`, as the place it
 * has there: a lesson in the module or a brief in the class.
 */
export function placeOf(course: LtiCourse, named: string): LtiLinkPlace | null {
  const [hostId = "", linkId = ""] = named.split(":");
  if (!ID.test(hostId) || !ID.test(linkId)) return null;
  return "moduleId" in course
    ? { lessonId: hostId, linkId }
    : { assignmentId: hostId, linkId };
}

/**
 * Whether a link is the tool's own, in a lesson or brief of the course,
 * written there or shown to students.
 */
export async function isToolLink(
  tx: CellTransaction,
  tenantId: string,
  tool: ToolRow,
  course: LtiCourse,
  place: LtiLinkPlace,
) {
  const host = place.lessonId
    ? { type: "lesson" as const, id: place.lessonId }
    : { type: "assignment" as const, id: place.assignmentId ?? "" };
  if ("moduleId" in course) {
    const lesson = await lessonById(tx, tenantId, host.id);
    if (lesson?.moduleId !== course.moduleId) return false;
  } else {
    const assignment = await assignmentById(tx, tenantId, host.id);
    if (assignment?.classId !== course.classId) return false;
  }
  const document = await documentOf(tx, tenantId, host);
  if (!document) return false;
  const published = await publishedVersion(tx, tenantId, document.id);
  const link =
    findLink(document.content, place.linkId) ??
    findLink(published?.content, place.linkId);
  return link?.toolId === tool.id;
}

const fieldsOf = (input: v.InferOutput<typeof agsLineItemSchema>) => ({
  label: input.label,
  scoreMaximum: input.scoreMaximum,
  resourceId: input.resourceId,
  tag: input.tag,
  startsAt: input.startDateTime,
  endsAt: input.endDateTime,
  gradesReleased: input.gradesReleased,
  submissionReview: input.submissionReview,
});

async function body(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * The school's grade services for tools, LTI's Assignment and Grade
 * Services: a tool's columns of grades in a course, the scores it sends
 * for students there, and the results it may read back. Each call carries
 * a token, and reaches only the tool's own columns.
 */
export async function gradeService(
  context: SchoolContext,
  request: Request,
  url: URL,
): Promise<Response> {
  const target = targetOf(url.pathname);
  if (!target) return refused(404, "NOT_FOUND");
  const token = await bearerOf(context, request);
  if (!token) return unauthorized();
  const tenantId = context.school.tenantId;
  const school = { tenantId, orgId: context.school.schoolId };
  const method = request.method;
  const payload =
    method === "POST" || method === "PUT" ? await body(request) : null;
  return context.cell.withTenant(asSystem(context), "write", async (tx) => {
    const tool = await toolById(tx, { ...school, id: token.toolId });
    if (!tool) return unauthorized();
    const may = (...scopes: string[]) =>
      scopes.some((scope) => grants(token, tool, scope));

    if (target.kind === "lineItems") {
      const [kind, id] = courseKey(target.course);
      if (
        !(await secretsFor(context).tagged(
          `course:${tool.id}:${kind}:${id}`,
          target.tag,
        ))
      )
        return refused(404, "NOT_FOUND");
      if (method === "GET") {
        if (!may(LTI_AGS_SCOPES.lineItem, LTI_AGS_SCOPES.lineItemRead))
          return refused(403, "insufficient_scope");
        const named = url.searchParams.get("resource_link_id");
        const link = named === null ? undefined : placeOf(target.course, named);
        if (link === null) return json([], MEDIA.lineItems);
        const limit = pageSize(url);
        const rows = await lineItemsIn(tx, {
          tenantId,
          toolId: tool.id,
          course: target.course,
          link,
          resourceId: url.searchParams.get("resource_id") ?? undefined,
          tag: url.searchParams.get("tag") ?? undefined,
          after: ID.test(url.searchParams.get("after") ?? "")
            ? (url.searchParams.get("after") ?? undefined)
            : undefined,
          limit: limit + 1,
        });
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return json(
          page.map((item) => lineItemJson(context, item)),
          MEDIA.lineItems,
          200,
          rows.length > limit && last ? nextLink(context, url, last.id) : {},
        );
      }
      if (method !== "POST") return refused(405, "METHOD_NOT_ALLOWED");
      if (!may(LTI_AGS_SCOPES.lineItem))
        return refused(403, "insufficient_scope");
      const parsed = v.safeParse(agsLineItemSchema, payload);
      if (!parsed.success) return refused(400, "invalid_request");
      let link: LtiLinkPlace | null = null;
      if (parsed.output.resourceLinkId) {
        link = placeOf(target.course, parsed.output.resourceLinkId);
        // A link must be the tool's own and in this course, as LTI asks.
        if (
          !link ||
          !(await isToolLink(tx, tenantId, tool, target.course, link))
        )
          return refused(404, "NOT_FOUND");
      }
      const made = await insertLineItem(tx, {
        tenantId,
        toolId: tool.id,
        course: target.course,
        link,
        ...fieldsOf(parsed.output),
      });
      const item = await lineItemById(tx, { ...school, id: made });
      return item
        ? json(lineItemJson(context, item), MEDIA.lineItem, 201)
        : refused(404, "NOT_FOUND");
    }

    const item = await lineItemById(tx, { ...school, id: target.id });
    if (item?.toolId !== tool.id) return refused(404, "NOT_FOUND");

    if (target.kind === "lineItem") {
      if (method === "GET") {
        if (!may(LTI_AGS_SCOPES.lineItem, LTI_AGS_SCOPES.lineItemRead))
          return refused(403, "insufficient_scope");
        return json(lineItemJson(context, item), MEDIA.lineItem);
      }
      if (!may(LTI_AGS_SCOPES.lineItem))
        return refused(403, "insufficient_scope");
      if (method === "DELETE") {
        await removeLineItem(tx, { tenantId, id: item.id });
        return new Response(null, { status: 204 });
      }
      if (method !== "PUT") return refused(405, "METHOD_NOT_ALLOWED");
      const parsed = v.safeParse(agsLineItemSchema, payload);
      if (!parsed.success) return refused(400, "invalid_request");
      await updateLineItem(tx, {
        tenantId,
        id: item.id,
        ...fieldsOf(parsed.output),
      });
      const applied = await lineItemById(tx, { ...school, id: item.id });
      return applied
        ? json(lineItemJson(context, applied), MEDIA.lineItem)
        : refused(404, "NOT_FOUND");
    }

    if (target.kind === "scores") {
      if (method !== "POST") return refused(405, "METHOD_NOT_ALLOWED");
      if (!may(LTI_AGS_SCOPES.score)) return refused(403, "insufficient_scope");
      const parsed = v.safeParse(agsScoreSchema, payload);
      if (!parsed.success) return refused(400, "invalid_request");
      const score = parsed.output;
      if (
        !(await learnsIn(tx, {
          tenantId,
          course: item.course,
          userId: score.userId,
        }))
      )
        return refused(404, "NOT_FOUND");
      // A score older than the one kept changes nothing, and is not an error.
      await keepScore(tx, {
        tenantId,
        lineItemId: item.id,
        studentUserId: score.userId,
        scoreGiven: score.scoreGiven,
        scoreMaximum: score.scoreGiven === null ? null : score.scoreMaximum,
        comment: score.comment,
        activityProgress: score.activityProgress,
        gradingProgress: score.gradingProgress,
        scoredAt: score.timestamp,
        scoringUserId: ID.test(score.scoringUserId ?? "")
          ? score.scoringUserId
          : null,
      });
      return new Response(null, { status: 204 });
    }

    if (method !== "GET") return refused(405, "METHOD_NOT_ALLOWED");
    if (!may(LTI_AGS_SCOPES.resultRead))
      return refused(403, "insufficient_scope");
    const one = target.userId ?? url.searchParams.get("user_id") ?? undefined;
    if (one !== undefined && !ID.test(one))
      return target.userId
        ? refused(404, "NOT_FOUND")
        : json([], MEDIA.results);
    const limit = pageSize(url);
    const after = url.searchParams.get("after") ?? "";
    const rows = await scoresIn(tx, {
      tenantId,
      lineItemId: item.id,
      studentUserId: one,
      after: ID.test(after) ? after : undefined,
      limit: limit + 1,
    });
    const itemUrl = lineItemUrl(context, item.id);
    const results = rows
      .slice(0, limit)
      .filter((row) => row.scoreGiven !== null || row.comment)
      .map((row) => ({
        id: `${itemUrl}/results/${row.studentUserId}`,
        scoreOf: itemUrl,
        userId: row.studentUserId,
        ...(resultOf(row, item) === null
          ? {}
          : {
              resultScore: resultOf(row, item),
              resultMaximum: item.scoreMaximum,
            }),
        ...(row.comment ? { comment: row.comment } : {}),
        ...(row.scoringUserId ? { scoringUserId: row.scoringUserId } : {}),
      }));
    if (target.userId) {
      const [result] = results;
      return result
        ? json(result, "application/vnd.ims.lis.v2.result+json")
        : refused(404, "NOT_FOUND");
    }
    const last = rows.slice(0, limit).at(-1);
    return json(
      results,
      MEDIA.results,
      200,
      rows.length > limit && last
        ? nextLink(context, url, last.studentUserId)
        : {},
    );
  });
}
