import type { CellTransaction } from "@faridalms/database/context";
import type { RegistrationRow } from "@faridalms/database/stores/cmi5";
import type { Cmi5Au, Cmi5Package, Cmi5Session } from "@faridalms/domain/cmi5";
import type { ContentNode } from "@faridalms/domain/content";
import type { XapiStatement } from "@faridalms/domain/xapi";

import { TenantUnavailableError } from "@faridalms/database/context";
import {
  dropStates,
  keepProgress,
  keepSession,
  openSessions,
  putState,
  registrationFor,
  sessionById,
  startSession,
  statesOf,
  useFetch,
} from "@faridalms/database/stores/cmi5";
import {
  documentOf,
  publishedVersion,
} from "@faridalms/database/stores/documents";
import {
  afterStatement,
  auSatisfied,
  CMI5_ACTIVITY_TYPES,
  CMI5_CATEGORY,
  CMI5_EXTENSIONS,
  CMI5_MOST_STATE,
  CMI5_VERBS,
  cmi5Issue,
  LAUNCH_DATA,
  LEARNER_PREFERENCES,
} from "@faridalms/domain/cmi5";
import { xapiDuration, XAPI_VERSION } from "@faridalms/domain/xapi";
import { ORPCError } from "@orpc/server";

import type {
  RequestContext,
  SchoolContext,
  UnitContext,
} from "../core/context";

import { portalOrigin } from "../core/portal";
import { localeOf, openUnit, schoolOf } from "../core/procedure";
import { canReadFile, hostAccess } from "../files/authorize";
import { findFile, withFileGate } from "../files/gate";
import { sealLink } from "../files/links";
import { PACKAGE_SECONDS, PACKAGE_TYPE } from "../files/packages";
import { secretsFor } from "../lti/shared";
import { sendStatements } from "../xapi/live";
import { learnerOf } from "../xapi/statements";

const ID = /^[0-9a-f-]{36}$/;

/** What a launch's fetch address carries: the session it gives a token for, once. */
interface FetchToken {
  kind: "cmi5-fetch";
  sessionId: string;
  schoolId: string;
}

/** What an AU's token carries: its session, in its school, and the reader's language. */
interface AuthToken {
  kind: "cmi5-auth";
  sessionId: string;
  schoolId: string;
  locale: string;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, content-type, x-experience-api-version, if-match, if-none-match",
  "access-control-allow-methods": "GET, PUT, POST, DELETE, OPTIONS",
  "access-control-expose-headers": "x-experience-api-version, last-modified",
  "access-control-max-age": "600",
};

const answer = (
  body: unknown,
  status = 200,
  more: Record<string, string> = {},
) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      "x-experience-api-version": XAPI_VERSION,
      "cache-control": "no-store",
      ...(body === null ? {} : { "content-type": "application/json" }),
      ...more,
    },
  });

const asSystem = (context: SchoolContext) => ({
  tenantId: context.school.tenantId,
  requestId: context.requestId,
  actor: { kind: "system" as const },
});

/** A course package placed in a document, by its id there, with the zip it came in. */
function packageIn(
  content: Record<string, unknown> | undefined,
  packageId: string,
): { fileId: string; package: Cmi5Package } | null {
  const pending = [
    ...((content?.root as ContentNode | undefined)?.children ?? []),
  ];
  for (let node = pending.shift(); node; node = pending.shift()) {
    if (
      node.type === "cmi5" &&
      node.cmi5?.packageId === packageId &&
      node.fileId
    )
      return { fileId: node.fileId, package: node.cmi5 };
    if (node.children) pending.push(...node.children);
  }
  return null;
}

/** A lesson's package as its reader may see it: published, or as written for whoever writes it. */
async function lessonPackage(
  tx: CellTransaction,
  tenantId: string,
  lessonId: string,
  packageId: string,
  writes: boolean,
) {
  const document = await documentOf(tx, tenantId, {
    type: "lesson",
    id: lessonId,
  });
  if (!document) return null;
  const published = await publishedVersion(tx, tenantId, document.id);
  return (
    (writes ? packageIn(document.content, packageId) : null) ??
    packageIn(published?.content, packageId) ??
    (writes ? null : packageIn(document.content, packageId))
  );
}

/** Ids the school gives an AU and its course, under the lesson's own address, never the publisher's. */
const activityOf = (home: string, lessonId: string, packageId: string) => ({
  course: `${home}/lessons/${lessonId}/packages/${packageId}`,
  au: (index: number) =>
    `${home}/lessons/${lessonId}/packages/${packageId}/aus/${index}`,
});

/** The statements the school itself makes in a session: launched, abandoned, satisfied. */
function schoolStatement(input: {
  verb: "launched" | "abandoned" | "satisfied";
  actor: ReturnType<typeof learnerOf>;
  object: { id: string; type?: string };
  registration: string;
  sessionId: string;
  extensions?: Record<string, unknown>;
  grouping?: string;
  result?: Record<string, unknown>;
}): XapiStatement {
  return {
    id: crypto.randomUUID(),
    actor: input.actor,
    verb: { id: CMI5_VERBS[input.verb], display: { "en-US": input.verb } },
    object: {
      objectType: "Activity",
      id: input.object.id,
      definition: {
        type: input.object.type ?? "http://adlnet.gov/expapi/activities/lesson",
        name: {},
      },
    },
    ...(input.result ? { result: input.result } : {}),
    context: {
      registration: input.registration,
      contextActivities: {
        category: [{ objectType: "Activity", id: CMI5_CATEGORY }],
        ...(input.grouping
          ? { grouping: [{ objectType: "Activity", id: input.grouping }] }
          : {}),
      },
      extensions: {
        [CMI5_EXTENSIONS.sessionId]: input.sessionId,
        ...input.extensions,
      },
    },
    timestamp: new Date().toISOString(),
    version: XAPI_VERSION,
  } as unknown as XapiStatement;
}

const scopeOf = (context: SchoolContext, tx: CellTransaction) => ({
  tx,
  tenantId: context.school.tenantId,
  school: context.school,
  domains: context.domains,
});

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
    if (error instanceof ORPCError)
      return Response.json({ code: error.code }, { status: error.status });
    if (error instanceof TenantUnavailableError)
      return Response.json({ code: "tenant.read_only" }, { status: 503 });
    throw error;
  }
}

/**
 * Launches an AU of a lesson's package for the signed-in person, as cmi5
 * asks of an LMS: their registration, any session left open abandoned, a
 * new session with its launch data written and its launched statement
 * made, then the AU opened with the record store's address, a fetch
 * address for its token, the person as an account with no name, the
 * registration and the activity id the school gives it.
 */
async function launch(context: SchoolContext, url: URL): Promise<Response> {
  const lessonId = url.searchParams.get("lesson") ?? "";
  const packageId = url.searchParams.get("package") ?? "";
  const index = Number(url.searchParams.get("au"));
  if (!ID.test(lessonId) || !ID.test(packageId) || !Number.isInteger(index))
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  return asPerson(context, async (unit) => {
    const access = await hostAccess(unit, { type: "lesson", id: lessonId });
    if (!access) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    const found = await lessonPackage(
      unit.tx,
      unit.tenantId,
      lessonId,
      packageId,
      access === "write",
    );
    const au = found?.package.aus[index];
    if (!found || !au)
      return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    const file = await findFile(unit.tx, unit.tenantId, found.fileId);
    const readable =
      file?.state === "ready" &&
      (await withFileGate(unit.tx, file.purpose, (tx) =>
        canReadFile({ ...unit, tx }, file),
      ));
    if (!file || !readable)
      return Response.json({ code: "NOT_FOUND" }, { status: 404 });
    const home = portalOrigin(unit.school, unit.domains);
    const actor = learnerOf(home, unit.actor.userId);
    const ids = activityOf(home, lessonId, packageId);
    const activityId = ids.au(index);
    const registration = await registrationFor(unit.tx, {
      tenantId: unit.tenantId,
      orgId: unit.schoolId,
      lessonId,
      packageId,
      studentUserId: unit.actor.userId,
    });
    const made: XapiStatement[] = [];
    // A session left open when the AU is launched again was abandoned.
    for (const open of await openSessions(unit.tx, {
      tenantId: unit.tenantId,
      registrationId: registration.id,
      auId: au.id,
    })) {
      await keepSession(unit.tx, {
        tenantId: unit.tenantId,
        id: open.id,
        verbs: open.verbs,
        ending: "abandoned",
      });
      made.push(
        schoolStatement({
          verb: "abandoned",
          actor,
          object: { id: open.activityId },
          registration: registration.id,
          sessionId: open.id,
          result: {
            duration: xapiDuration(
              open.lastAt.getTime() - open.launchedAt.getTime(),
            ),
          },
        }),
      );
    }
    const sessionId = await startSession(unit.tx, {
      tenantId: unit.tenantId,
      registrationId: registration.id,
      studentUserId: unit.actor.userId,
      auId: au.id,
      activityId,
    });
    const target = /^https:\/\//i.test(au.url)
      ? new URL(au.url)
      : new URL(
          `${context.filesOrigin}/pkg/${sealLink(context.linkKey, {
            storageKey: file.storageKey,
            name: "package",
            mediaType: PACKAGE_TYPE,
            sizeBytes: file.sizeBytes,
            disposition: "inline",
            expires: Math.floor(Date.now() / 1000) + PACKAGE_SECONDS,
            sealed:
              file.keyVersion === null
                ? null
                : { tenantId: unit.tenantId, keyVersion: file.keyVersion },
          })}/${au.url}`,
        );
    const launchUrl = `${target.origin}${target.pathname}`;
    await putState(unit.tx, {
      tenantId: unit.tenantId,
      registrationId: registration.id,
      studentUserId: unit.actor.userId,
      activityId,
      stateId: LAUNCH_DATA,
      contentType: "application/json",
      body: JSON.stringify(launchData(au, sessionId)),
    });
    made.push(
      schoolStatement({
        verb: "launched",
        actor,
        object: { id: activityId },
        registration: registration.id,
        sessionId,
        grouping: au.id,
        extensions: {
          [CMI5_EXTENSIONS.launchMode]: "Normal",
          [CMI5_EXTENSIONS.launchUrl]: launchUrl,
          [CMI5_EXTENSIONS.moveOn]: au.moveOn,
          ...(au.masteryScore === undefined
            ? {}
            : { [CMI5_EXTENSIONS.masteryScore]: au.masteryScore }),
          ...(au.launchParameters === undefined
            ? {}
            : { [CMI5_EXTENSIONS.launchParameters]: au.launchParameters }),
        },
      }),
    );
    await sendStatements(
      scopeOf(context, unit.tx),
      made.map((statement) => ({
        studentUserId: unit.actor.userId,
        statement,
      })),
    );
    const handed: FetchToken = {
      kind: "cmi5-fetch",
      sessionId,
      schoolId: unit.schoolId,
    };
    target.searchParams.set("endpoint", `${home}/cmi5/xapi/`);
    target.searchParams.set(
      "fetch",
      `${home}/cmi5/fetch?t=${await secretsFor(context).sign(handed, PACKAGE_SECONDS)}`,
    );
    target.searchParams.set("actor", JSON.stringify(actor));
    target.searchParams.set("registration", registration.id);
    target.searchParams.set("activityId", activityId);
    return new Response(null, {
      status: 302,
      headers: { location: target.toString(), "cache-control": "no-store" },
    });
  });
}

/** What the school tells an AU of its launch before it starts, cmi5's LMS.LaunchData. */
function launchData(au: Cmi5Au, sessionId: string) {
  return {
    contextTemplate: {
      contextActivities: {
        grouping: [{ objectType: "Activity", id: au.id }],
      },
      extensions: { [CMI5_EXTENSIONS.sessionId]: sessionId },
    },
    launchMode: "Normal",
    launchMethod: au.launchMethod,
    moveOn: au.moveOn,
    ...(au.masteryScore === undefined ? {} : { masteryScore: au.masteryScore }),
    ...(au.launchParameters === undefined
      ? {}
      : { launchParameters: au.launchParameters }),
    ...(au.entitlementKey === undefined
      ? {}
      : { entitlementKey: { courseStructure: au.entitlementKey } }),
  };
}

/**
 * An AU's fetch address: it gives the session's token once, as cmi5 asks,
 * always answering 200 with JSON, an error code when it cannot.
 */
async function fetchToken(
  context: SchoolContext,
  request: Request,
  url: URL,
): Promise<Response> {
  const failed = (code: "1" | "2" | "3", text: string) =>
    answer({ "error-code": code, "error-text": text });
  if (request.method !== "POST") return failed("3", "Use POST.");
  const token = await secretsFor(context).read<FetchToken>(
    url.searchParams.get("t") ?? "",
  );
  if (
    token?.kind !== "cmi5-fetch" ||
    token.schoolId !== context.school.schoolId
  )
    return failed("2", "This address is not one the school gave.");
  const fresh = await context.cell.withTenant(
    asSystem(context),
    "write",
    (tx) =>
      useFetch(tx, { tenantId: context.school.tenantId, id: token.sessionId }),
  );
  if (!fresh) return failed("1", "This address was used already.");
  const auth: AuthToken = {
    kind: "cmi5-auth",
    sessionId: token.sessionId,
    schoolId: token.schoolId,
    locale: localeOf(context),
  };
  const signed = await secretsFor(context).sign(auth, PACKAGE_SECONDS);
  return answer({
    "auth-token": Buffer.from(`cmi5:${signed}`).toString("base64"),
  });
}

/** The session an AU's request is for, by the token it carries. */
async function authOf(
  context: SchoolContext,
  request: Request,
): Promise<AuthToken | null> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice(6), "base64").toString();
  const signed = decoded.startsWith("cmi5:") ? decoded.slice(5) : "";
  const token = await secretsFor(context).read<AuthToken>(signed);
  return token?.kind === "cmi5-auth" &&
    token.schoolId === context.school.schoolId
    ? token
    : null;
}

/** An agent named in a request, when it is the session's own learner. */
function sameAgent(
  raw: string | null,
  actor: { homePage: string; name: string },
) {
  try {
    const agent = JSON.parse(raw ?? "") as {
      account?: { homePage?: string; name?: string };
    };
    return (
      agent.account?.homePage === actor.homePage &&
      agent.account.name === actor.name
    );
  } catch {
    return false;
  }
}

async function bodyText(request: Request) {
  const text = await request.text();
  return new TextEncoder().encode(text).byteLength > CMI5_MOST_STATE
    ? null
    : text;
}

/**
 * The record store an AU reports to: its statements, checked against
 * cmi5's rules for its session before any is kept, and sent on to the
 * school's own store; its state documents; its learner's preferences;
 * and what version of xAPI this is.
 */
async function xapi(
  context: SchoolContext,
  request: Request,
  url: URL,
): Promise<Response> {
  const resource = url.pathname.slice("/cmi5/xapi/".length);
  if (resource === "about" && request.method === "GET")
    return answer({ version: [XAPI_VERSION] });
  const version = request.headers.get("x-experience-api-version") ?? "";
  if (!/^1\.0(\.\d+)?$/.test(version)) return answer({ error: "version" }, 400);
  const auth = await authOf(context, request);
  if (!auth) return answer({ error: "unauthorized" }, 401);
  const home = portalOrigin(context.school, context.domains);
  return context.cell.withTenant(asSystem(context), "write", async (tx) => {
    const session = await sessionById(tx, {
      tenantId: context.school.tenantId,
      id: auth.sessionId,
    });
    if (!session) return answer({ error: "unauthorized" }, 401);
    // A session the school saw abandoned takes nothing more.
    if (session.endedAt && !session.verbs.includes("terminated"))
      return answer({ error: "session_ended" }, 403);
    const registration = session.registration;
    const actor = { homePage: home, name: registration.studentUserId };
    if (resource === "statements")
      return statements(context, tx, request, url, {
        session,
        registration,
        actor,
      });
    if (resource === "activities/state")
      return state(tx, context.school.tenantId, request, url, {
        session,
        registration,
        actor,
      });
    if (resource === "agents/profile") {
      if (request.method !== "GET") return answer(null, 403);
      if (
        !sameAgent(url.searchParams.get("agent"), actor) ||
        url.searchParams.get("profileId") !== LEARNER_PREFERENCES
      )
        return answer(null, 404);
      return answer({
        languagePreference: auth.locale === "ar" ? "ar,en" : "en,ar",
      });
    }
    return answer(null, 404);
  });
}

type Judged = {
  session: NonNullable<Awaited<ReturnType<typeof sessionById>>>;
  registration: RegistrationRow;
  actor: { homePage: string; name: string };
};

async function statements(
  context: SchoolContext,
  tx: CellTransaction,
  request: Request,
  url: URL,
  { session, registration, actor }: Judged,
): Promise<Response> {
  if (request.method !== "POST" && request.method !== "PUT")
    return answer({ error: "method" }, 405);
  let received: unknown;
  try {
    received = (await request.json()) as unknown;
  } catch {
    return answer({ error: "statement" }, 400);
  }
  const named = url.searchParams.get("statementId");
  if (request.method === "PUT" && (!named || !ID.test(named)))
    return answer({ error: "statementId" }, 400);
  const list = (Array.isArray(received) ? received : [received]) as Record<
    string,
    unknown
  >[];
  if (list.length === 0 || list.length > 100)
    return answer({ error: "statement" }, 400);
  const found = await lessonPackage(
    tx,
    context.school.tenantId,
    registration.lessonId,
    registration.packageId,
    true,
  );
  const au = found?.package.aus.find((each) => each.id === session.auId);
  if (!found || !au) return answer({ error: "package" }, 403);
  let judged: Cmi5Session = {
    sessionId: session.id,
    registration: registration.id,
    activityId: session.activityId,
    actor,
    masteryScore: au.masteryScore ?? null,
    verbs: session.verbs,
    progress: registration.progress[au.id] ?? {},
  };
  const kept: Record<string, unknown>[] = [];
  for (const each of list) {
    const issue = cmi5Issue(each, judged);
    // A rejected statement rejects its batch, as xAPI asks.
    if (issue) return answer({ error: issue }, issue === "voiding" ? 403 : 400);
    const id =
      request.method === "PUT" ? named : (each.id ?? crypto.randomUUID());
    if (
      typeof id !== "string" ||
      !ID.test(id) ||
      (each.id !== undefined && each.id !== id)
    )
      return answer({ error: "id" }, 400);
    kept.push({
      ...each,
      id,
      timestamp: each.timestamp ?? new Date().toISOString(),
    });
    judged = { ...judged, ...afterStatement(each, judged) };
  }
  const progress = { ...registration.progress, [au.id]: judged.progress };
  const satisfied = found.package.aus.every((each) =>
    auSatisfied(each.moveOn, progress[each.id] as Cmi5Session["progress"]),
  );
  await keepSession(tx, {
    tenantId: context.school.tenantId,
    id: session.id,
    verbs: judged.verbs,
    ...(judged.verbs.includes("terminated")
      ? { ending: "terminated" as const }
      : {}),
  });
  await keepProgress(tx, {
    tenantId: context.school.tenantId,
    registrationId: registration.id,
    progress,
    satisfied,
  });
  const ids = activityOf(
    actor.homePage,
    registration.lessonId,
    registration.packageId,
  );
  const outgoing = [
    ...kept,
    // The course is satisfied once, when its last AU meets its rule.
    ...(satisfied && !registration.satisfiedAt
      ? [
          schoolStatement({
            verb: "satisfied",
            actor: learnerOf(actor.homePage, actor.name),
            object: { id: ids.course, type: CMI5_ACTIVITY_TYPES.course },
            registration: registration.id,
            sessionId: session.id,
          }),
        ]
      : []),
  ];
  await sendStatements(
    scopeOf(context, tx),
    outgoing.map((statement) => ({
      studentUserId: registration.studentUserId,
      statement: statement as unknown as XapiStatement,
    })),
  );
  return request.method === "PUT"
    ? answer(null, 204)
    : answer(kept.map((statement) => statement.id));
}

/**
 * xAPI's State resource for an AU's own activity in its registration. The
 * launch data the school wrote is read, never changed; a JSON document
 * posted is merged into the one kept.
 */
async function state(
  tx: CellTransaction,
  tenantId: string,
  request: Request,
  url: URL,
  { session, registration, actor }: Judged,
): Promise<Response> {
  const activityId = url.searchParams.get("activityId");
  const asked = url.searchParams.get("registration");
  if (
    activityId !== session.activityId ||
    !sameAgent(url.searchParams.get("agent"), actor) ||
    (asked !== null && asked !== registration.id)
  )
    return answer({ error: "scope" }, 403);
  const stateId = url.searchParams.get("stateId") ?? undefined;
  const where = { tenantId, registrationId: registration.id, activityId };
  if (request.method === "GET") {
    const sinceText = url.searchParams.get("since");
    const since = sinceText ? new Date(sinceText) : undefined;
    if (since && Number.isNaN(since.getTime()))
      return answer({ error: "since" }, 400);
    const rows = await statesOf(tx, { ...where, stateId, since });
    if (stateId === undefined) return answer(rows.map((row) => row.stateId));
    const [row] = rows;
    return row
      ? new Response(row.body, {
          headers: {
            ...CORS,
            "x-experience-api-version": XAPI_VERSION,
            "content-type": row.contentType,
            "last-modified": row.updatedAt.toUTCString(),
            "cache-control": "no-store",
          },
        })
      : answer(null, 404);
  }
  if (stateId === LAUNCH_DATA) return answer({ error: "launch_data" }, 403);
  if (request.method === "DELETE") {
    await dropStates(tx, { ...where, stateId, keep: [LAUNCH_DATA] });
    return answer(null, 204);
  }
  if (request.method !== "PUT" && request.method !== "POST")
    return answer({ error: "method" }, 405);
  if (!stateId || stateId.length > 500)
    return answer({ error: "stateId" }, 400);
  const body = await bodyText(request);
  if (body === null) return answer({ error: "too_large" }, 413);
  const contentType = (
    request.headers.get("content-type") ?? "application/octet-stream"
  ).slice(0, 200);
  let kept = body;
  if (request.method === "POST") {
    const [before] = await statesOf(tx, { ...where, stateId });
    const merged = mergedJson(before?.body ?? null, body);
    if (merged === null) return answer({ error: "not_json" }, 400);
    kept = merged;
  }
  await putState(tx, {
    ...where,
    studentUserId: registration.studentUserId,
    stateId,
    contentType,
    body: kept,
  });
  return answer(null, 204);
}

const isObject = (value: unknown): value is object =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** A JSON object posted to a state document, its top-level properties merged into the kept one. */
function mergedJson(before: string | null, posted: string): string | null {
  try {
    const next = JSON.parse(posted) as unknown;
    const old = before === null ? {} : (JSON.parse(before) as unknown);
    if (!isObject(next) || !isObject(old)) return null;
    return JSON.stringify({ ...old, ...next });
  } catch {
    return null;
  }
}

/** Course packages' launches and the record store their AUs report to, under `/cmi5/`. */
export async function handleCmi5Request(
  request: Request,
  url: URL,
  context: RequestContext,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/cmi5/")) return null;
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers: CORS });
  const school = await schoolOf(context);
  if (!school) return answer({ code: "NOT_FOUND" }, 404);
  const scoped: SchoolContext = { ...context, school };
  if (url.pathname === "/cmi5/launch" && request.method === "GET")
    return launch(scoped, url);
  if (url.pathname === "/cmi5/fetch") return fetchToken(scoped, request, url);
  if (url.pathname.startsWith("/cmi5/xapi/")) return xapi(scoped, request, url);
  return answer({ code: "NOT_FOUND" }, 404);
}
