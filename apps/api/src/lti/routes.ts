import type { ContentNode } from "@faridalms/domain/content";
import type { LtiHost, LtiLink } from "@faridalms/domain/lti";

import { TenantUnavailableError } from "@faridalms/database/context";
import { classById } from "@faridalms/database/stores/classes";
import { assignmentById, namesOf } from "@faridalms/database/stores/coursework";
import {
  documentOf,
  publishedVersion,
} from "@faridalms/database/stores/documents";
import { lessonById, moduleById } from "@faridalms/database/stores/learning";
import {
  publishedKeys,
  toolByClientId,
  toolById,
} from "@faridalms/database/stores/lti";
import {
  COURSE_OFFERING,
  LTI_CLAIM,
  LTI_HOSTS,
  LTI_ROLES,
  LTI_VERSION,
} from "@faridalms/domain/lti";
import { ORPCError } from "@orpc/server";

import type {
  RequestContext,
  SchoolContext,
  UnitContext,
} from "../core/context";
import type { LtiSecrets } from "./crypto";

import { openUnit, schoolOf } from "../core/procedure";
import { hostAccess } from "../files/authorize";
import { ltiSecrets } from "./crypto";
import { schoolSigningKey, signed } from "./keys";

const secretsOf = new WeakMap<Uint8Array, LtiSecrets>();
const secretsFor = (context: RequestContext) => {
  let found = secretsOf.get(context.cellSecret);
  if (!found) {
    found = ltiSecrets(context.cellSecret);
    secretsOf.set(context.cellSecret, found);
  }
  return found;
};

/** The school's address as tools know it, which every message names. */
export const issuerOf = (school: { appHost: string }) =>
  `https://${school.appHost}/lti`;

const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

/**
 * A page that posts itself on to a tool, as the OAuth form post answer
 * mode asks: nothing in it is kept or cached, and a button stands in for a
 * browser that runs no script.
 */
export function postedTo(action: string, fields: Record<string, string>) {
  const inputs = Object.entries(fields)
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escape(name)}" value="${escape(value)}">`,
    )
    .join("");
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>…</title></head><body><form method="post" action="${escape(action)}">${inputs}<noscript><button type="submit">Continue</button></noscript></form><script>document.forms[0].submit()</script></body></html>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        pragma: "no-cache",
      },
    },
  );
}

const refused = (status: number, code: string) =>
  Response.json({ code }, { status });

/**
 * A link's id as tools know it: its place, the lesson or brief, with its
 * own id there, so a link copied into another lesson is another link, as
 * LTI asks.
 */
export const resourceLinkId = (hostId: string, linkId: string) =>
  `${hostId}:${linkId}`;

/** A link to an outside tool in a document, found by its id. */
function findLink(
  content: Record<string, unknown> | undefined,
  linkId: string,
): LtiLink | null {
  const pending = [
    ...((content?.root as ContentNode | undefined)?.children ?? []),
  ];
  for (let node = pending.shift(); node; node = pending.shift()) {
    if (node.type === "lti" && node.lti?.linkId === linkId) return node.lti;
    if (node.children) pending.push(...node.children);
  }
  return null;
}

/**
 * What a launch is from: the link in a lesson or brief the viewer may open,
 * its tool, whether they teach it or learn from it, and the course it sits
 * in, a lesson's module or an assignment's class.
 */
async function launchOf(
  unit: UnitContext,
  host: { type: LtiHost; id: string },
  linkId: string,
) {
  const access = await hostAccess(unit, host);
  if (!access) return null;
  const document = await documentOf(unit.tx, unit.tenantId, host);
  if (!document) return null;
  const published = await publishedVersion(unit.tx, unit.tenantId, document.id);
  const link =
    (access === "write" ? findLink(document.content, linkId) : null) ??
    findLink(published?.content, linkId) ??
    (access === "write" ? null : findLink(document.content, linkId));
  if (!link) return null;
  const tool = await toolById(unit.tx, {
    tenantId: unit.tenantId,
    orgId: unit.schoolId,
    id: link.toolId,
  });
  if (!tool) return null;
  let course: { id: string; title: string } | null = null;
  if (host.type === "lesson") {
    const lesson = await lessonById(unit.tx, unit.tenantId, host.id);
    const module = lesson
      ? await moduleById(unit.tx, unit.tenantId, lesson.moduleId)
      : null;
    course = module ? { id: module.id, title: module.title } : null;
  } else {
    const assignment = await assignmentById(unit.tx, unit.tenantId, host.id);
    const taught = assignment
      ? await classById(unit.tx, unit, assignment.classId)
      : null;
    course = taught
      ? {
          id: taught.id,
          title: taught.titleEn ?? taught.titleAr ?? taught.code,
        }
      : null;
  }
  if (!course) return null;
  return { link, tool, course, teaching: access === "write" };
}

interface LaunchHint {
  kind: "launch";
  host: LtiHost;
  hostId: string;
  linkId: string;
  userId: string;
}

/** Runs a unit of work for the signed-in person, answering refusals as HTTP. */
async function asPerson(
  context: SchoolContext,
  run: (unit: UnitContext) => Promise<Response>,
): Promise<Response> {
  try {
    return await openUnit(context, "write", (unit) =>
      run({ ...context, ...unit }),
    );
  } catch (error) {
    if (error instanceof ORPCError) return refused(error.status, error.code);
    if (error instanceof TenantUnavailableError)
      return refused(503, "tenant.read_only");
    throw error;
  }
}

/**
 * Starts a launch from a link in a lesson or brief: the school's side of
 * LTI's third-party-initiated sign-in, posted to the tool's sign-in
 * address with a hint, signed here, that says which link it is for.
 */
async function launch(context: SchoolContext, url: URL): Promise<Response> {
  const host = url.searchParams.get("host") ?? "";
  const hostId = url.searchParams.get("id") ?? "";
  const linkId = url.searchParams.get("link") ?? "";
  if (
    !(LTI_HOSTS as readonly string[]).includes(host) ||
    !/^[0-9a-f-]{36}$/.test(hostId) ||
    !/^[0-9a-f-]{36}$/.test(linkId)
  )
    return refused(404, "NOT_FOUND");
  return asPerson(context, async (unit) => {
    const found = await launchOf(
      unit,
      { type: host as LtiHost, id: hostId },
      linkId,
    );
    if (!found) return refused(404, "NOT_FOUND");
    const hint: LaunchHint = {
      kind: "launch",
      host: host as LtiHost,
      hostId,
      linkId,
      userId: unit.actor.userId,
    };
    return postedTo(found.tool.loginUrl, {
      iss: issuerOf(context.school),
      login_hint: unit.actor.userId,
      target_link_uri: found.link.url ?? found.tool.launchUrl,
      lti_message_hint: await secretsFor(context).sign(hint, 300),
      client_id: found.tool.clientId,
      lti_deployment_id: found.tool.deploymentId,
    });
  });
}

async function parameters(request: Request, url: URL) {
  if (request.method === "GET") return url.searchParams;
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/x-www-form-urlencoded")) return null;
  return new URLSearchParams(await request.text());
}

/**
 * The school's authorization endpoint, which a tool sends the browser to
 * after its sign-in starts: checked as OpenID Connect and LTI ask, it posts
 * the signed launch back to the address the tool registered.
 */
async function authorize(
  context: SchoolContext,
  request: Request,
  url: URL,
): Promise<Response> {
  const params = await parameters(request, url);
  if (!params) return refused(400, "invalid_request");
  const value = (name: string) => params.get(name) ?? "";
  const school = {
    tenantId: context.school.tenantId,
    orgId: context.school.schoolId,
  };
  // A tool or address the school does not know is answered here, never
  // sent anywhere.
  const tool = await context.cell.withTenant(
    {
      tenantId: school.tenantId,
      requestId: context.requestId,
      actor: { kind: "system" },
    },
    "read",
    (tx) => toolByClientId(tx, { ...school, clientId: value("client_id") }),
  );
  const redirect = value("redirect_uri");
  if (!tool || !tool.redirectUrls.includes(redirect))
    return refused(400, "invalid_request");
  if (value("response_mode") !== "form_post")
    return refused(400, "invalid_request");
  const fail = (error: string) =>
    postedTo(redirect, { error, state: value("state") });
  if (
    !value("scope").split(" ").includes("openid") ||
    value("response_type") !== "id_token" ||
    !value("nonce") ||
    value("prompt") !== "none"
  )
    return fail("invalid_request");
  const hint = await secretsFor(context).read<LaunchHint>(
    value("lti_message_hint"),
  );
  if (!hint) return fail("invalid_request");
  const answered = await asPerson(context, async (unit) => {
    if (
      unit.actor.userId !== value("login_hint") ||
      unit.actor.userId !== hint.userId
    )
      return fail("login_required");
    const found = await launchOf(
      unit,
      { type: hint.host, id: hint.hostId },
      hint.linkId,
    );
    if (!found || found.tool.id !== tool.id) return fail("invalid_request");
    const [person] = found.tool.sendNames
      ? await namesOf(unit.tx, unit.tenantId, [unit.actor.userId])
      : [];
    const locale =
      context.headers.get("x-farida-locale") === "ar" ? "ar" : "en";
    const token = await signed(
      {
        iss: issuerOf(context.school),
        aud: [tool.clientId],
        azp: tool.clientId,
        sub: unit.actor.userId,
        nonce: value("nonce"),
        [LTI_CLAIM.messageType]: "LtiResourceLinkRequest",
        [LTI_CLAIM.version]: LTI_VERSION,
        [LTI_CLAIM.deploymentId]: tool.deploymentId,
        [LTI_CLAIM.targetLinkUri]: found.link.url ?? tool.launchUrl,
        [LTI_CLAIM.resourceLink]: {
          id: resourceLinkId(hint.hostId, found.link.linkId),
          title: found.link.title,
          ...(found.link.text ? { description: found.link.text } : {}),
        },
        [LTI_CLAIM.roles]: found.teaching
          ? LTI_ROLES.instructor
          : LTI_ROLES.learner,
        [LTI_CLAIM.context]: {
          id: found.course.id,
          title: found.course.title,
          type: [COURSE_OFFERING],
        },
        [LTI_CLAIM.launchPresentation]: { document_target: "window", locale },
        [LTI_CLAIM.custom]: { ...tool.custom, ...found.link.custom },
        [LTI_CLAIM.toolPlatform]: {
          guid: context.school.schoolId,
          name: context.school.nameEn ?? context.school.nameAr ?? "",
          product_family_code: "farida",
        },
        ...(person
          ? {
              name: person.fullNameEn ?? person.fullNameAr ?? "",
              locale,
            }
          : {}),
      },
      await schoolSigningKey(unit.tx, context.school, secretsFor(context)),
    );
    return postedTo(redirect, { id_token: token, state: value("state") });
  });
  // Without a session the launch cannot go on, and the tool is told so.
  return answered.status === 401 ? fail("login_required") : answered;
}

/** The school's public keys, by which tools check what it signs. */
async function keySet(context: SchoolContext): Promise<Response> {
  const keys = await context.cell.withTenant(
    {
      tenantId: context.school.tenantId,
      requestId: context.requestId,
      actor: { kind: "system" },
    },
    "write",
    async (tx) => {
      await schoolSigningKey(tx, context.school, secretsFor(context));
      return publishedKeys(tx, {
        tenantId: context.school.tenantId,
        orgId: context.school.schoolId,
      });
    },
  );
  return Response.json({ keys });
}

/** The school's side of LTI 1.3, its addresses under `/lti/`. */
export async function handleLtiRequest(
  request: Request,
  url: URL,
  context: RequestContext,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/lti/")) return null;
  const school = await schoolOf(context);
  if (!school) return refused(404, "NOT_FOUND");
  const scoped: SchoolContext = { ...context, school };
  if (url.pathname === "/lti/jwks" && request.method === "GET")
    return keySet(scoped);
  if (url.pathname === "/lti/launch" && request.method === "GET")
    return launch(scoped, url);
  if (
    url.pathname === "/lti/auth" &&
    (request.method === "GET" || request.method === "POST")
  )
    return authorize(scoped, request, url);
  return refused(404, "NOT_FOUND");
}
