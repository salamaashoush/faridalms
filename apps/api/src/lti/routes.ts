import type { ContentNode } from "@faridalms/domain/content";
import type { LtiHost, LtiLink, LtiPick } from "@faridalms/domain/lti";

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
  useOnce,
} from "@faridalms/database/stores/lti";
import {
  COURSE_OFFERING,
  LTI_CLAIM,
  LTI_DL_CLAIM,
  LTI_HOSTS,
  LTI_PICK_CHANNEL,
  LTI_ROLES,
  LTI_VERSION,
  ltiPickOf,
} from "@faridalms/domain/lti";
import { ORPCError } from "@orpc/server";
import { decodeJwt, jwtVerify } from "jose";

import type {
  RequestContext,
  SchoolContext,
  UnitContext,
} from "../core/context";
import type { LtiSecrets } from "./crypto";

import { localeOf, openUnit, schoolOf } from "../core/procedure";
import { hostAccess } from "../files/authorize";
import { ltiSecrets } from "./crypto";
import { schoolSigningKey, signed, toolKeys } from "./keys";

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
  const course = await courseOf(unit, host);
  if (!course) return null;
  return { link, tool, course, teaching: access === "write" };
}

/** The course a lesson or brief sits in: a lesson's module or an assignment's class. */
async function courseOf(
  unit: UnitContext,
  host: { type: LtiHost; id: string },
): Promise<{ id: string; title: string } | null> {
  if (host.type === "lesson") {
    const lesson = await lessonById(unit.tx, unit.tenantId, host.id);
    const module = lesson
      ? await moduleById(unit.tx, unit.tenantId, lesson.moduleId)
      : null;
    return module ? { id: module.id, title: module.title } : null;
  }
  const assignment = await assignmentById(unit.tx, unit.tenantId, host.id);
  const taught = assignment
    ? await classById(unit.tx, unit, assignment.classId)
    : null;
  return taught
    ? { id: taught.id, title: taught.titleEn ?? taught.titleAr ?? taught.code }
    : null;
}

/**
 * What a teacher picks content in from: a tool that offers Deep Linking,
 * for a lesson or brief they may change.
 */
async function pickOf(
  unit: UnitContext,
  host: { type: LtiHost; id: string },
  toolId: string,
) {
  if ((await hostAccess(unit, host)) !== "write") return null;
  const tool = await toolById(unit.tx, {
    tenantId: unit.tenantId,
    orgId: unit.schoolId,
    id: toolId,
  });
  if (!tool?.deepLinkUrl) return null;
  const course = await courseOf(unit, host);
  return course ? { tool, deepLinkUrl: tool.deepLinkUrl, course } : null;
}

interface LaunchHint {
  kind: "launch";
  host: LtiHost;
  hostId: string;
  linkId: string;
  userId: string;
}

interface PickHint {
  kind: "pick";
  host: LtiHost;
  hostId: string;
  toolId: string;
  /** The editor waiting for what is picked, which the answer is sent to. */
  pickId: string;
  userId: string;
}

/** What a tool hands back with its picked content, which only this cell signs. */
interface PickData {
  kind: "picked";
  toolId: string;
  pickId: string;
}

const ID = /^[0-9a-f-]{36}$/;

/** The lesson or brief a request names, when it names one. */
function hostIn(url: URL): { type: LtiHost; id: string } | null {
  const type = url.searchParams.get("host") ?? "";
  const id = url.searchParams.get("id") ?? "";
  return (LTI_HOSTS as readonly string[]).includes(type) && ID.test(id)
    ? { type: type as LtiHost, id }
    : null;
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
  const host = hostIn(url);
  const linkId = url.searchParams.get("link") ?? "";
  if (!host || !ID.test(linkId)) return refused(404, "NOT_FOUND");
  return asPerson(context, async (unit) => {
    const found = await launchOf(unit, host, linkId);
    if (!found) return refused(404, "NOT_FOUND");
    const hint: LaunchHint = {
      kind: "launch",
      host: host.type,
      hostId: host.id,
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

/**
 * Starts a teacher's pick of a tool's content for a link, LTI's Deep
 * Linking: the same sign-in as a launch, aimed at the tool's address for
 * choosing content, with a hint that names the editor waiting for it.
 */
async function pick(context: SchoolContext, url: URL): Promise<Response> {
  const host = hostIn(url);
  const toolId = url.searchParams.get("tool") ?? "";
  const pickId = url.searchParams.get("pick") ?? "";
  if (!host || !ID.test(toolId) || !ID.test(pickId))
    return refused(404, "NOT_FOUND");
  return asPerson(context, async (unit) => {
    const found = await pickOf(unit, host, toolId);
    if (!found) return refused(404, "NOT_FOUND");
    const hint: PickHint = {
      kind: "pick",
      host: host.type,
      hostId: host.id,
      toolId,
      pickId,
      userId: unit.actor.userId,
    };
    return postedTo(found.tool.loginUrl, {
      iss: issuerOf(context.school),
      login_hint: unit.actor.userId,
      target_link_uri: found.deepLinkUrl,
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

/** What a launch tells a tool of the link it is from and who opens it. */
async function launchMessage(unit: UnitContext, hint: LaunchHint) {
  const found = await launchOf(
    unit,
    { type: hint.host, id: hint.hostId },
    hint.linkId,
  );
  if (!found) return null;
  return {
    tool: found.tool,
    course: found.course,
    claims: {
      [LTI_CLAIM.messageType]: "LtiResourceLinkRequest",
      [LTI_CLAIM.targetLinkUri]: found.link.url ?? found.tool.launchUrl,
      [LTI_CLAIM.resourceLink]: {
        id: resourceLinkId(hint.hostId, found.link.linkId),
        title: found.link.title,
        ...(found.link.text ? { description: found.link.text } : {}),
      },
      [LTI_CLAIM.roles]: found.teaching
        ? LTI_ROLES.instructor
        : LTI_ROLES.learner,
      [LTI_CLAIM.custom]: { ...found.tool.custom, ...found.link.custom },
    },
  };
}

/**
 * What a pick tells a tool: what it may hand back, one link at a time
 * opened in its own window, and where to send it, with data signed here
 * that names the editor waiting for it.
 */
async function pickMessage(
  context: SchoolContext,
  unit: UnitContext,
  hint: PickHint,
) {
  const found = await pickOf(
    unit,
    { type: hint.host, id: hint.hostId },
    hint.toolId,
  );
  if (!found) return null;
  const data: PickData = {
    kind: "picked",
    toolId: found.tool.id,
    pickId: hint.pickId,
  };
  return {
    tool: found.tool,
    course: found.course,
    claims: {
      [LTI_CLAIM.messageType]: "LtiDeepLinkingRequest",
      [LTI_CLAIM.targetLinkUri]: found.deepLinkUrl,
      [LTI_CLAIM.roles]: LTI_ROLES.instructor,
      [LTI_CLAIM.custom]: found.tool.custom,
      [LTI_DL_CLAIM.settings]: {
        deep_link_return_url: `${issuerOf(context.school)}/deep-link`,
        accept_types: ["ltiResourceLink"],
        accept_presentation_document_targets: ["window"],
        accept_multiple: false,
        // A teacher may browse a tool's library a while before picking.
        data: await secretsFor(context).sign(data, 3600),
      },
    },
  };
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
  const hint = await secretsFor(context).read<LaunchHint | PickHint>(
    value("lti_message_hint"),
  );
  if (hint?.kind !== "launch" && hint?.kind !== "pick")
    return fail("invalid_request");
  const answered = await asPerson(context, async (unit) => {
    if (
      unit.actor.userId !== value("login_hint") ||
      unit.actor.userId !== hint.userId
    )
      return fail("login_required");
    const message =
      hint.kind === "launch"
        ? await launchMessage(unit, hint)
        : await pickMessage(context, unit, hint);
    if (!message || message.tool.id !== tool.id) return fail("invalid_request");
    const [person] = tool.sendNames
      ? await namesOf(unit.tx, unit.tenantId, [unit.actor.userId])
      : [];
    const locale = localeOf(context);
    const token = await signed(
      {
        iss: issuerOf(context.school),
        aud: [tool.clientId],
        azp: tool.clientId,
        sub: unit.actor.userId,
        nonce: value("nonce"),
        [LTI_CLAIM.version]: LTI_VERSION,
        [LTI_CLAIM.deploymentId]: tool.deploymentId,
        [LTI_CLAIM.context]: {
          id: message.course.id,
          title: message.course.title,
          type: [COURSE_OFFERING],
        },
        [LTI_CLAIM.launchPresentation]: { document_target: "window", locale },
        [LTI_CLAIM.toolPlatform]: {
          guid: context.school.schoolId,
          name: context.school.nameEn ?? context.school.nameAr ?? "",
          product_family_code: "farida",
        },
        ...message.claims,
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

const PICKED_TEXT = {
  en: {
    done: "Done. You can close this window.",
    failed:
      "The tool's answer could not be used. Close this window and try again.",
  },
  ar: {
    done: "تم. يمكنك إغلاق هذه النافذة.",
    failed: "تعذّر استخدام ردّ الأداة. أغلق هذه النافذة وحاول مرة أخرى.",
  },
} as const;

/**
 * The page a pick ends on in the tool's window: it hands what was picked
 * to the editor waiting for it, on a channel of this site's own, and
 * closes unless there is a problem to show, the tool's own words for it
 * when it gave some.
 */
function pickedPage(
  context: SchoolContext,
  answer: { pickId: string; item: LtiPick | null } | null,
  problem: string | null = null,
): Response {
  const locale = localeOf(context);
  const text = PICKED_TEXT[locale];
  const failed = !answer || problem !== null;
  const body = [
    `<p>${escape(failed ? text.failed : text.done)}</p>`,
    problem ? `<p dir="auto">${escape(problem)}</p>` : "",
  ].join("");
  const script = answer
    ? `<script>const c=new BroadcastChannel(${JSON.stringify(LTI_PICK_CHANNEL)});c.postMessage(${JSON.stringify(answer).replaceAll("<", "\\u003c")});c.close();${failed ? "" : "window.close();"}</script>`
    : "";
  return new Response(
    `<!doctype html><html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Farida</title></head><body style="font:16px/1.5 system-ui,sans-serif;margin:2rem">${body}${script}</body></html>`,
    {
      status: answer ? 200 : 400,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

/**
 * Where a tool sends the browser back with the content a teacher picked.
 * It is posted from the tool's site, so it comes without the teacher's
 * session, and is believed only as the tool signed it, once, and as this
 * cell signed the data inside it.
 */
async function picked(
  context: SchoolContext,
  request: Request,
): Promise<Response> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/x-www-form-urlencoded"))
    return pickedPage(context, null);
  const jwt = new URLSearchParams(await request.text()).get("JWT") ?? "";
  let clientId = "";
  try {
    clientId = decodeJwt(jwt).iss ?? "";
  } catch {
    return pickedPage(context, null);
  }
  const system = {
    tenantId: context.school.tenantId,
    requestId: context.requestId,
    actor: { kind: "system" as const },
  };
  const scope = {
    tenantId: context.school.tenantId,
    orgId: context.school.schoolId,
  };
  const tool = await context.cell.withTenant(system, "read", (tx) =>
    toolByClientId(tx, { ...scope, clientId }),
  );
  if (!tool) return pickedPage(context, null);
  const payload = await jwtVerify(jwt, toolKeys(tool.jwksUrl), {
    issuer: tool.clientId,
    audience: issuerOf(context.school),
    algorithms: ["RS256"],
    requiredClaims: ["exp", "iat", "nonce"],
    maxTokenAge: "10m",
    clockTolerance: 60,
  }).then(
    (verified) => verified.payload,
    () => null,
  );
  const signedData = payload?.[LTI_DL_CLAIM.data];
  if (
    !payload ||
    typeof payload.nonce !== "string" ||
    typeof signedData !== "string" ||
    payload[LTI_CLAIM.messageType] !== "LtiDeepLinkingResponse" ||
    payload[LTI_CLAIM.version] !== LTI_VERSION ||
    payload[LTI_CLAIM.deploymentId] !== tool.deploymentId
  )
    return pickedPage(context, null);
  const nonce = payload.nonce;
  const data = await secretsFor(context).read<PickData>(signedData);
  if (data?.kind !== "picked" || data.toolId !== tool.id)
    return pickedPage(context, null);
  // Beyond its age a token is refused anyway, so its nonce is kept no longer.
  const fresh = await context.cell.withTenant(system, "write", (tx) =>
    useOnce(tx, {
      tenantId: scope.tenantId,
      key: `pick:${tool.id}:${nonce}`,
      expiresAt: new Date(Date.now() + 12 * 60 * 1000),
    }),
  );
  if (!fresh) return pickedPage(context, null);
  const items = payload[LTI_DL_CLAIM.contentItems];
  const first = Array.isArray(items) ? (items[0] as unknown) : undefined;
  const item = first === undefined ? null : ltiPickOf(first);
  const told = payload[LTI_DL_CLAIM.errormsg];
  const problem =
    typeof told === "string" && told.trim()
      ? told.trim().slice(0, 500)
      : first !== undefined && !item
        ? ""
        : null;
  return pickedPage(context, { pickId: data.pickId, item }, problem);
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
  if (url.pathname === "/lti/pick" && request.method === "GET")
    return pick(scoped, url);
  if (url.pathname === "/lti/deep-link" && request.method === "POST")
    return picked(scoped, request);
  return refused(404, "NOT_FOUND");
}
