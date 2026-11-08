import type { CellTransaction } from "@faridalms/database/context";
import type { LtiCourse, ToolRow } from "@faridalms/database/stores/lti";
import type { LtiHost, LtiPicked } from "@faridalms/domain/lti";

import { TenantUnavailableError } from "@faridalms/database/context";
import { classById } from "@faridalms/database/stores/classes";
import { assignmentById, namesOf } from "@faridalms/database/stores/coursework";
import {
  documentOf,
  publishedVersion,
} from "@faridalms/database/stores/documents";
import { lessonById, moduleById } from "@faridalms/database/stores/learning";
import {
  declaredLineItem,
  lineItemById,
  publishedKeys,
  scoresIn,
  toolByClientId,
  toolById,
  useOnce,
} from "@faridalms/database/stores/lti";
import {
  COURSE_OFFERING,
  LTI_ACCEPT_TYPES,
  LTI_CLAIM,
  LTI_DL_CLAIM,
  LTI_HOSTS,
  LTI_PICK_CHANNEL,
  LTI_ROLES,
  LTI_VERSION,
  ltiPickedOf,
} from "@faridalms/domain/lti";
import { ORPCError } from "@orpc/server";
import { decodeJwt, jwtVerify } from "jose";

import type {
  RequestContext,
  SchoolContext,
  UnitContext,
} from "../core/context";

import { editableModule } from "../core/learning-access";
import { can, localeOf, openUnit, schoolOf } from "../core/procedure";
import { teaches } from "../core/reach";
import { hostAccess } from "../files/authorize";
import { gradeService, gradesClaim, issueToken } from "./grades";
import { schoolSigningKey, signed, toolKeys } from "./keys";
import { openIdConfiguration, registerTool } from "./registration";
import { courseNamed, rosterClaim, rosterService } from "./roster";
import {
  escape,
  findLink,
  issuerOf,
  refused,
  resourceLinkId,
  secretsFor,
} from "./shared";

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

/** A teacher's launch from a score to the work behind it, LTI's Submission Review. */
interface ReviewHint {
  kind: "review";
  lineItemId: string;
  studentId: string;
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

/** The course a lesson's or brief's grades sit in, as the grade services name it. */
const courseFor = (host: LtiHost, courseId: string): LtiCourse =>
  host === "lesson" ? { moduleId: courseId } : { classId: courseId };

/** What a launch tells a tool of the services the school lets it use in a course. */
async function servicesClaims(
  context: SchoolContext,
  tool: ToolRow,
  course: LtiCourse,
  lineItemId: string | null,
) {
  return {
    ...(tool.grades
      ? await gradesClaim(context, tool.id, course, lineItemId)
      : {}),
    ...(tool.roster ? await rosterClaim(context, tool.id, course) : {}),
  };
}

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
    if (url.searchParams.get("frame") === "1") {
      const framed = await framedHint(context, unit, hint);
      if (!framed) return refused(404, "NOT_FOUND");
      return postedTo(framed.tool.loginUrl, {
        iss: issuerOf(context.school),
        login_hint: unit.actor.userId,
        target_link_uri: framed.target,
        lti_message_hint: framed.hint,
        client_id: framed.tool.clientId,
        lti_deployment_id: framed.tool.deploymentId,
      });
    }
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

/**
 * What a review is of: a tool's column and a student's score in it, which
 * the person may see as one who marks the course, the column's link when
 * it has one, and the course.
 */
async function reviewOf(
  unit: UnitContext,
  lineItemId: string,
  studentId: string,
) {
  const item = await lineItemById(unit.tx, {
    tenantId: unit.tenantId,
    orgId: unit.schoolId,
    id: lineItemId,
  });
  if (!item?.submissionReview) return null;
  const tool = await toolById(unit.tx, {
    tenantId: unit.tenantId,
    orgId: unit.schoolId,
    id: item.toolId,
  });
  if (!tool) return null;
  const marks =
    "moduleId" in item.course
      ? await editableModule(unit, item.course.moduleId).then(
          () => true,
          () => false,
        )
      : can(unit, "submissions:grade") &&
        (await teaches(unit, "teaching", item.course.classId));
  if (!marks) return null;
  // There is work to look at once the tool has said something of it.
  const [score] = await scoresIn(unit.tx, {
    tenantId: unit.tenantId,
    lineItemId: item.id,
    studentUserId: studentId,
    limit: 1,
  });
  if (!score) return null;
  const host = item.link?.lessonId
    ? { type: "lesson" as const, id: item.link.lessonId }
    : item.link?.assignmentId
      ? { type: "assignment" as const, id: item.link.assignmentId }
      : null;
  const document = host ? await documentOf(unit.tx, unit.tenantId, host) : null;
  const published = document
    ? await publishedVersion(unit.tx, unit.tenantId, document.id)
    : null;
  const link =
    host && item.link
      ? (findLink(published?.content, item.link.linkId) ??
        findLink(document?.content, item.link.linkId))
      : null;
  const course = await courseNamed(unit.tx, unit, item.course);
  if (!course) return null;
  return {
    item,
    tool,
    course,
    link: host && item.link && link ? { host, link } : null,
    targetLinkUri:
      item.submissionReview.url ??
      tool.reviewUrl ??
      link?.url ??
      tool.launchUrl,
  };
}

/**
 * Starts a teacher's launch from a student's score in a tool's column to
 * the work behind it, by the same sign-in as a launch.
 */
async function review(context: SchoolContext, url: URL): Promise<Response> {
  const lineItemId = url.searchParams.get("item") ?? "";
  const studentId = url.searchParams.get("student") ?? "";
  if (!ID.test(lineItemId) || !ID.test(studentId))
    return refused(404, "NOT_FOUND");
  return asPerson(context, async (unit) => {
    const found = await reviewOf(unit, lineItemId, studentId);
    if (!found) return refused(404, "NOT_FOUND");
    const hint: ReviewHint = {
      kind: "review",
      lineItemId,
      studentId,
      userId: unit.actor.userId,
    };
    return postedTo(found.tool.loginUrl, {
      iss: issuerOf(context.school),
      login_hint: unit.actor.userId,
      target_link_uri: found.targetLinkUri,
      lti_message_hint: await secretsFor(context).sign(hint, 300),
      client_id: found.tool.clientId,
      lti_deployment_id: found.tool.deploymentId,
    });
  });
}

/** What a review tells a tool: whose work, in which column, and where to come back to. */
async function reviewMessage(
  context: SchoolContext,
  unit: UnitContext,
  hint: ReviewHint,
) {
  const found = await reviewOf(unit, hint.lineItemId, hint.studentId);
  if (!found) return null;
  const { item, tool, link } = found;
  const [student] = tool.sendNames
    ? await namesOf(unit.tx, unit.tenantId, [hint.studentId])
    : [];
  const returnTo =
    link?.host.type === "assignment"
      ? `/grading?${new URLSearchParams({ assignmentId: link.host.id, studentId: hint.studentId })}`
      : "moduleId" in item.course
        ? `/modules/${item.course.moduleId}?tab=progress`
        : `/gradebook?${new URLSearchParams({ classId: item.course.classId })}`;
  return {
    tool,
    course: found.course,
    target: "window" as const,
    returnUrl: `https://${context.school.appHost}${returnTo}`,
    claims: {
      [LTI_CLAIM.messageType]: "LtiSubmissionReviewRequest",
      [LTI_CLAIM.targetLinkUri]: found.targetLinkUri,
      [LTI_CLAIM.roles]: LTI_ROLES.instructor,
      [LTI_CLAIM.forUser]: {
        user_id: hint.studentId,
        roles: LTI_ROLES.learner,
        ...(student
          ? { name: student.fullNameEn ?? student.fullNameAr ?? "" }
          : {}),
      },
      ...(link
        ? {
            [LTI_CLAIM.resourceLink]: {
              id: resourceLinkId(link.host.id, link.link.linkId),
              title: link.link.title,
              ...(link.link.text ? { description: link.link.text } : {}),
            },
          }
        : {}),
      [LTI_CLAIM.custom]: {
        ...tool.custom,
        ...link?.link.custom,
        ...item.submissionReview?.custom,
      },
      ...(await servicesClaims(context, tool, item.course, item.id)),
    },
  };
}

async function parameters(request: Request, url: URL) {
  if (request.method === "GET") return url.searchParams;
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/x-www-form-urlencoded")) return null;
  return new URLSearchParams(await request.text());
}

/** What a launch tells a tool of the link it is from and who opens it. */
async function launchMessage(
  context: SchoolContext,
  unit: UnitContext,
  hint: LaunchHint,
) {
  const found = await launchOf(
    unit,
    { type: hint.host, id: hint.hostId },
    hint.linkId,
  );
  if (!found) return null;
  const course = courseFor(hint.host, found.course.id);
  // The column the link's content asked for is made at its first launch,
  // which is the first time the tool could report into it.
  const declared = found.link.lineItem
    ? await declaredLineItem(unit.tx, {
        tenantId: unit.tenantId,
        toolId: found.tool.id,
        course,
        link: {
          ...(hint.host === "lesson"
            ? { lessonId: hint.hostId }
            : { assignmentId: hint.hostId }),
          linkId: found.link.linkId,
        },
        label: found.link.lineItem.label || found.link.title || found.tool.name,
        scoreMaximum: found.link.lineItem.scoreMaximum,
        resourceId: found.link.lineItem.resourceId ?? null,
        tag: found.link.lineItem.tag ?? null,
        submissionReview: found.link.lineItem.submissionReview ?? null,
      })
    : null;
  return {
    tool: found.tool,
    course: found.course,
    target: "window" as const,
    returnUrl: null,
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
      ...(await servicesClaims(context, found.tool, course, declared)),
    },
  };
}

/**
 * What a pick tells a tool: what it may hand back, several items at once
 * of the kinds the editor places, shown in the page or opened in a window,
 * and where to send it, with data signed here that names the editor
 * waiting for it.
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
    target: "window" as const,
    returnUrl: null,
    claims: {
      [LTI_CLAIM.messageType]: "LtiDeepLinkingRequest",
      [LTI_CLAIM.targetLinkUri]: found.deepLinkUrl,
      [LTI_CLAIM.roles]: LTI_ROLES.instructor,
      [LTI_CLAIM.custom]: found.tool.custom,
      [LTI_DL_CLAIM.settings]: {
        deep_link_return_url: `${issuerOf(context.school)}/deep-link`,
        accept_types: LTI_ACCEPT_TYPES,
        accept_presentation_document_targets: ["iframe", "window", "embed"],
        accept_multiple: true,
        accept_lineitem: found.tool.grades,
        // A teacher may browse a tool's library a while before picking.
        data: await secretsFor(context).sign(data, 3600),
      },
      ...(await servicesClaims(
        context,
        found.tool,
        courseFor(hint.host, found.course.id),
        null,
      )),
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
  const sent = value("lti_message_hint");
  if (sent.startsWith(FRAMED))
    return framedAnswer(context, tool, sent, {
      loginHint: value("login_hint"),
      nonce: value("nonce"),
      reply: (fields) =>
        postedTo(redirect, { ...fields, state: value("state") }),
    });
  const hint = await secretsFor(context).read<
    LaunchHint | PickHint | ReviewHint
  >(sent);
  if (
    hint?.kind !== "launch" &&
    hint?.kind !== "pick" &&
    hint?.kind !== "review"
  )
    return fail("invalid_request");
  const answered = await asPerson(context, async (unit) => {
    if (
      unit.actor.userId !== value("login_hint") ||
      unit.actor.userId !== hint.userId
    )
      return fail("login_required");
    const message =
      hint.kind === "launch"
        ? await launchMessage(context, unit, hint)
        : hint.kind === "pick"
          ? await pickMessage(context, unit, hint)
          : await reviewMessage(context, unit, hint);
    if (!message || message.tool.id !== tool.id) return fail("invalid_request");
    const token = await idToken(context, unit.tx, tool, {
      userId: unit.actor.userId,
      nonce: value("nonce"),
      course: message.course,
      target: message.target,
      returnUrl: message.returnUrl,
      claims: message.claims,
      name: await nameFor(unit, tool),
    });
    return postedTo(redirect, { id_token: token, state: value("state") });
  });
  // Without a session the launch cannot go on, and the tool is told so.
  return answered.status === 401 ? fail("login_required") : answered;
}

/** A person's name as a tool that is sent names is told it; none for one that is not. */
async function nameFor(unit: UnitContext, tool: ToolRow) {
  const [person] = tool.sendNames
    ? await namesOf(unit.tx, unit.tenantId, [unit.actor.userId])
    : [];
  return person ? (person.fullNameEn ?? person.fullNameAr ?? "") : null;
}

/** What a launch's signed token says beyond the message itself. */
interface Launched {
  userId: string;
  nonce: string;
  course: { id: string; title: string };
  target: "window" | "iframe";
  returnUrl: string | null;
  claims: Record<string, unknown>;
  name: string | null;
}

/** The launch as the tool receives it: signed with the school's key, for five minutes. */
async function idToken(
  context: SchoolContext,
  tx: CellTransaction,
  tool: ToolRow,
  launched: Launched,
) {
  const locale = localeOf(context);
  return signed(
    {
      iss: issuerOf(context.school),
      aud: [tool.clientId],
      azp: tool.clientId,
      sub: launched.userId,
      nonce: launched.nonce,
      [LTI_CLAIM.version]: LTI_VERSION,
      [LTI_CLAIM.deploymentId]: tool.deploymentId,
      [LTI_CLAIM.context]: {
        id: launched.course.id,
        title: launched.course.title,
        type: [COURSE_OFFERING],
      },
      [LTI_CLAIM.launchPresentation]: {
        document_target: launched.target,
        locale,
        ...(launched.returnUrl ? { return_url: launched.returnUrl } : {}),
      },
      [LTI_CLAIM.toolPlatform]: {
        guid: context.school.schoolId,
        name: context.school.nameEn ?? context.school.nameAr ?? "",
        product_family_code: "farida",
      },
      ...launched.claims,
      ...(launched.name === null ? {} : { name: launched.name, locale }),
    },
    await schoolSigningKey(tx, context.school, secretsFor(context)),
  );
}

/** Marks a hint that carries a launch shown in the page, sealed. */
const FRAMED = "f.";
/** How long a launch shown in the page has to come back from the tool's sign-in. */
const FRAMED_SECONDS = 120;

/** A launch shown in the page, made while the person was signed in and sealed into its hint. */
interface FramedLaunch {
  kind: "framed";
  id: string;
  toolId: string;
  exp: number;
  launched: Omit<Launched, "nonce">;
}

/**
 * The hint for a launch shown in the page. A frame's trip through the
 * tool's site comes back without the person's session cookie, which the
 * browser keeps from a cross-site frame, so the launch is made here while
 * the person is signed in, sealed so the tool cannot read or change it,
 * and taken once, within two minutes, by the tool it was made for.
 */
async function framedHint(
  context: SchoolContext,
  unit: UnitContext,
  hint: LaunchHint,
) {
  const message = await launchMessage(context, unit, hint);
  if (!message) return null;
  const framed: FramedLaunch = {
    kind: "framed",
    id: crypto.randomUUID(),
    toolId: message.tool.id,
    exp: Math.floor(Date.now() / 1000) + FRAMED_SECONDS,
    launched: {
      userId: unit.actor.userId,
      course: message.course,
      target: "iframe",
      returnUrl: null,
      claims: message.claims,
      name: await nameFor(unit, message.tool),
    },
  };
  return {
    tool: message.tool,
    hint: `${FRAMED}${await secretsFor(context).seal(framed)}`,
    target: message.claims[LTI_CLAIM.targetLinkUri],
  };
}

/** Answers a tool's sign-in for a launch shown in the page, from its sealed hint. */
async function framedAnswer(
  context: SchoolContext,
  tool: ToolRow,
  sent: string,
  asked: {
    loginHint: string;
    nonce: string;
    reply: (fields: Record<string, string>) => Response;
  },
) {
  const framed = await secretsFor(context)
    .open<FramedLaunch>(sent.slice(FRAMED.length))
    .catch(() => null);
  if (
    framed?.kind !== "framed" ||
    framed.toolId !== tool.id ||
    framed.exp <= Math.floor(Date.now() / 1000) ||
    framed.launched.userId !== asked.loginHint
  )
    return asked.reply({ error: "invalid_request" });
  const system = {
    tenantId: context.school.tenantId,
    requestId: context.requestId,
    actor: { kind: "system" as const },
  };
  const token = await context.cell.withTenant(system, "write", async (tx) => {
    const fresh = await useOnce(tx, {
      tenantId: context.school.tenantId,
      key: `framed:${framed.id}`,
      expiresAt: new Date((framed.exp + 60) * 1000),
    });
    return fresh
      ? idToken(context, tx, tool, { ...framed.launched, nonce: asked.nonce })
      : null;
  });
  return token
    ? asked.reply({ id_token: token })
    : asked.reply({ error: "invalid_request" });
}

const PICKED_TEXT = {
  en: {
    done: "Done. You can close this window.",
    partly:
      "Some of what you picked could not be placed. The rest is in the editor; you can close this window.",
    failed:
      "The tool's answer could not be used. Close this window and try again.",
  },
  ar: {
    done: "تم. يمكنك إغلاق هذه النافذة.",
    partly:
      "تعذّر وضع بعض ما اخترته. الباقي في المحرّر، ويمكنك إغلاق هذه النافذة.",
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
  answer: { pickId: string; items: LtiPicked[] } | null,
  problem: string | null = null,
): Response {
  const locale = localeOf(context);
  const text = PICKED_TEXT[locale];
  const failed = !answer || problem !== null;
  const partly = failed && answer !== null && answer.items.length > 0;
  const body = [
    `<p>${escape(partly ? text.partly : failed ? text.failed : text.done)}</p>`,
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
  const { picked: items, refused: left } = ltiPickedOf(
    payload[LTI_DL_CLAIM.contentItems],
  );
  const told = payload[LTI_DL_CLAIM.errormsg];
  // What can be placed is placed; the teacher is told when some could not be.
  const problem =
    typeof told === "string" && told.trim()
      ? told.trim().slice(0, 500)
      : left > 0
        ? ""
        : null;
  return pickedPage(context, { pickId: data.pickId, items }, problem);
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
  if (url.pathname === "/lti/review" && request.method === "GET")
    return review(scoped, url);
  if (url.pathname.startsWith("/lti/nrps/"))
    return rosterService(scoped, request, url);
  if (url.pathname === "/lti/openid-configuration" && request.method === "GET")
    return openIdConfiguration(scoped);
  if (url.pathname === "/lti/register" && request.method === "POST")
    return registerTool(scoped, request);
  if (url.pathname === "/lti/deep-link" && request.method === "POST")
    return picked(scoped, request);
  if (url.pathname === "/lti/token" && request.method === "POST")
    return issueToken(scoped, request);
  if (url.pathname.startsWith("/lti/ags/"))
    return gradeService(scoped, request, url);
  return refused(404, "NOT_FOUND");
}
