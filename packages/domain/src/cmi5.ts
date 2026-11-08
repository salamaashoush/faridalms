import * as v from "valibot";

/**
 * Course packages in the cmi5 profile of xAPI: a course of assignable units
 * (AUs), each a page the school launches for a student with the address of
 * a record store and a token for it, which then reports what the student
 * did as statements the school checks against cmi5's rules.
 */

export const CMI5_MOVE_ON = [
  "Passed",
  "Completed",
  "CompletedAndPassed",
  "CompletedOrPassed",
  "NotApplicable",
] as const;
export type Cmi5MoveOn = (typeof CMI5_MOVE_ON)[number];

/**
 * How an AU is launched (cmi5 10.2.2): Normal records what the student
 * achieves; Browse, to look around, and Review, to revisit what is done,
 * record nothing that counts, so their AUs send only initialized,
 * terminated and statements cmi5 does not define. The teacher chooses it
 * on the block.
 */
export const CMI5_LAUNCH_MODES = ["Normal", "Browse", "Review"] as const;
export type Cmi5LaunchMode = (typeof CMI5_LAUNCH_MODES)[number];

const ADL = "http://adlnet.gov/expapi/verbs";
const W3ID = "https://w3id.org/xapi/adl/verbs";
export const CMI5_VERBS = {
  launched: `${ADL}/launched`,
  initialized: `${ADL}/initialized`,
  completed: `${ADL}/completed`,
  passed: `${ADL}/passed`,
  failed: `${ADL}/failed`,
  terminated: `${ADL}/terminated`,
  abandoned: `${W3ID}/abandoned`,
  waived: `${W3ID}/waived`,
  satisfied: `${W3ID}/satisfied`,
} as const;
export type Cmi5Verb = keyof typeof CMI5_VERBS;

export const VOIDED = `${ADL}/voided`;

const CMI5 = "https://w3id.org/xapi/cmi5";
export const CMI5_CATEGORY = `${CMI5}/context/categories/cmi5`;
export const CMI5_MOVE_ON_CATEGORY = `${CMI5}/context/categories/moveon`;
export const CMI5_EXTENSIONS = {
  sessionId: `${CMI5}/context/extensions/sessionid`,
  masteryScore: `${CMI5}/context/extensions/masteryscore`,
  launchMode: `${CMI5}/context/extensions/launchmode`,
  launchUrl: `${CMI5}/context/extensions/launchurl`,
  moveOn: `${CMI5}/context/extensions/moveon`,
  launchParameters: `${CMI5}/context/extensions/launchparameters`,
} as const;
export const CMI5_ACTIVITY_TYPES = {
  course: `${CMI5}/activitytype/course`,
  block: `${CMI5}/activitytype/block`,
} as const;

/** The state document the school writes before each launch, which an AU reads and never changes. */
export const LAUNCH_DATA = "LMS.LaunchData";
export const LEARNER_PREFERENCES = "cmi5LearnerPreferences";

/** The most AUs one package may hold here, and the most bytes one state document. */
export const CMI5_MOST_AUS = 200;
export const CMI5_MOST_STATE = 65_536;

const iri = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500));

/**
 * Where an AU starts: a path inside its package, which the school serves,
 * or a full https address outside it.
 */
const auUrl = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(2000),
  v.check(
    (url) =>
      /^https:\/\//i.test(url) ||
      (!/^[a-z][a-z0-9+.-]*:/i.test(url) &&
        !url.startsWith("/") &&
        !url.split(/[?#]/)[0]?.split("/").includes("..")),
    "cmi5.url",
  ),
);

export const cmi5AuSchema = v.object({
  id: iri,
  title: v.pipe(v.string(), v.maxLength(200)),
  url: auUrl,
  moveOn: v.picklist(CMI5_MOVE_ON),
  masteryScore: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
  launchMethod: v.picklist(["AnyWindow", "OwnWindow"]),
  launchParameters: v.optional(v.pipe(v.string(), v.maxLength(1000))),
  entitlementKey: v.optional(v.pipe(v.string(), v.maxLength(500))),
});
export type Cmi5Au = v.InferOutput<typeof cmi5AuSchema>;

/**
 * A course package placed in a lesson: the stored zip it came in, its own
 * id there, the course's publisher id and title, and its AUs in order.
 */
export const cmi5PackageSchema = v.object({
  packageId: v.pipe(v.string(), v.uuid()),
  courseId: iri,
  title: v.pipe(v.string(), v.maxLength(200)),
  aus: v.pipe(
    v.array(cmi5AuSchema),
    v.minLength(1),
    v.maxLength(CMI5_MOST_AUS),
  ),
});
export type Cmi5Package = v.InferOutput<typeof cmi5PackageSchema>;

/** An element's own children of a name, whatever namespace prefix they carry. */
const childrenNamed = (element: Element, name: string) =>
  [...element.children].filter((child) => child.localName === name);

/** A langstring's text, in the language asked for when it is there. */
function langstring(element: Element | undefined, language: string) {
  const strings = element ? childrenNamed(element, "langstring") : [];
  const chosen =
    strings.find((each) =>
      (each.getAttribute("lang") ?? "").toLowerCase().startsWith(language),
    ) ?? strings[0];
  return (chosen?.textContent ?? element?.textContent ?? "").trim();
}

/**
 * A course structure, the cmi5.xml at a package's root, read into the
 * package a lesson keeps: the course and its AUs in order, those in blocks
 * among them, with what each asks to move on. Whitespace around values is
 * dropped, as cmi5 asks. Null when it is not a course structure or names
 * an AU the rules do not allow.
 */
export function cmi5Of(
  root: Element,
  packageId: string,
  language = "en",
): Cmi5Package | null {
  if (root.localName !== "courseStructure") return null;
  const course = childrenNamed(root, "course")[0];
  if (!course) return null;
  const aus: unknown[] = [];
  const pending = [...root.children];
  for (let node = pending.shift(); node; node = pending.shift()) {
    if (node.localName === "block") pending.unshift(...node.children);
    if (node.localName !== "au") continue;
    const mastery = node.getAttribute("masteryScore")?.trim();
    const parameters = childrenNamed(node, "launchParameters")[0];
    const entitlement = childrenNamed(node, "entitlementKey")[0];
    aus.push({
      id: node.getAttribute("id")?.trim() ?? "",
      title: langstring(childrenNamed(node, "title")[0], language).slice(
        0,
        200,
      ),
      url: childrenNamed(node, "url")[0]?.textContent.trim() ?? "",
      moveOn: node.getAttribute("moveOn")?.trim() || "NotApplicable",
      ...(mastery ? { masteryScore: Number(mastery) } : {}),
      launchMethod: node.getAttribute("launchMethod")?.trim() || "AnyWindow",
      ...(parameters?.textContent.trim()
        ? { launchParameters: parameters.textContent.trim() }
        : {}),
      ...(entitlement?.textContent.trim()
        ? { entitlementKey: entitlement.textContent.trim() }
        : {}),
    });
  }
  const parsed = v.safeParse(cmi5PackageSchema, {
    packageId,
    courseId: course.getAttribute("id")?.trim() ?? "",
    title: langstring(childrenNamed(course, "title")[0], language).slice(
      0,
      200,
    ),
    aus,
  });
  return parsed.success ? parsed.output : null;
}

/** Where an AU stands in a registration, from the statements it has sent. */
export interface AuProgress {
  completed?: boolean;
  passed?: boolean;
  failed?: boolean;
  waived?: boolean;
  /** The scaled score of the AU's passed or failed statement. */
  score?: number;
}

/** Whether an AU has met what its course asks of it to move on. */
export function auSatisfied(moveOn: Cmi5MoveOn, progress: AuProgress = {}) {
  const met: Record<Cmi5MoveOn, boolean> = {
    Passed: Boolean(progress.passed),
    Completed: Boolean(progress.completed),
    CompletedAndPassed: Boolean(progress.completed && progress.passed),
    CompletedOrPassed: Boolean(progress.completed || progress.passed),
    NotApplicable: true,
  };
  return Boolean(progress.waived) || met[moveOn];
}

/** What the school knows of the session a statement comes in. */
export interface Cmi5Session {
  sessionId: string;
  registration: string;
  activityId: string;
  actor: { homePage: string; name: string };
  masteryScore: number | null;
  launchMode: Cmi5LaunchMode;
  /** The cmi5 verbs sent in this session so far. */
  verbs: string[];
  /** Where the AU stands across its registration before this statement. */
  progress: AuProgress;
}

interface Received {
  id?: unknown;
  actor?: {
    objectType?: unknown;
    account?: { homePage?: unknown; name?: unknown };
  };
  verb?: { id?: unknown };
  object?: { id?: unknown; objectType?: unknown };
  result?: {
    score?: { scaled?: unknown };
    success?: unknown;
    completion?: unknown;
    duration?: unknown;
  };
  context?: {
    registration?: unknown;
    contextActivities?: { category?: unknown };
    extensions?: Record<string, unknown>;
  };
}

const cmi5VerbOf = (id: unknown): Cmi5Verb | null =>
  (Object.entries(CMI5_VERBS).find(([, address]) => address === id)?.[0] as
    | Cmi5Verb
    | undefined) ?? null;

const categoriesOf = (statement: Received) => {
  const category = statement.context?.contextActivities?.category;
  return Array.isArray(category)
    ? category.map((each) => (each as { id?: unknown }).id)
    : [];
};

/**
 * Why a statement an AU sends breaks cmi5's rules for its session, or null
 * when it may be kept: it must name the launched learner and registration,
 * come after initialized and before terminated, send each cmi5 verb once,
 * keep completed and passed to once a registration, keep scores to passed
 * and failed and agree with the mastery score, and carry the cmi5 context
 * a cmi5-defined statement needs. An AU never voids, nor sends what only
 * the school says, nor, launched to browse or review, anything that
 * would count: completed, passed or failed.
 */
export function cmi5Issue(
  received: unknown,
  session: Cmi5Session,
): string | null {
  if (!received || typeof received !== "object" || Array.isArray(received))
    return "statement";
  const statement = received as Received;
  const account = statement.actor?.account;
  if (
    account?.homePage !== session.actor.homePage ||
    account.name !== session.actor.name
  )
    return "actor";
  if (typeof statement.verb?.id !== "string") return "verb";
  if (statement.verb.id === VOIDED) return "voiding";
  if (statement.context?.registration !== session.registration)
    return "registration";
  const verb = cmi5VerbOf(statement.verb.id);
  const seen = session.verbs;
  if (seen.includes("terminated")) return "terminated";
  if (
    verb === "launched" ||
    verb === "abandoned" ||
    verb === "waived" ||
    verb === "satisfied"
  )
    return "school_only";
  if (verb !== "initialized" && !seen.includes("initialized"))
    return "not_initialized";
  if (
    session.launchMode !== "Normal" &&
    (verb === "completed" || verb === "passed" || verb === "failed")
  )
    return "launch_mode";
  const result = statement.result;
  if (!verb) {
    // A cmi5-allowed statement carries no move-on category.
    return categoriesOf(statement).includes(CMI5_MOVE_ON_CATEGORY)
      ? "category"
      : null;
  }
  if (statement.object?.id !== session.activityId) return "object";
  if (!categoriesOf(statement).includes(CMI5_CATEGORY)) return "category";
  if (
    statement.context.extensions?.[CMI5_EXTENSIONS.sessionId] !==
    session.sessionId
  )
    return "session";
  if (seen.includes(verb)) return "repeated";
  const judged = verb === "passed" || verb === "failed";
  if (judged && (seen.includes("passed") || seen.includes("failed")))
    return "repeated";
  if (verb === "completed" && session.progress.completed) return "repeated";
  if (verb === "passed" && session.progress.passed) return "repeated";
  if (verb === "failed" && session.progress.passed)
    return "failed_after_passed";
  const scaled = result?.score?.scaled;
  if (result?.score !== undefined && !judged) return "score";
  if (
    scaled !== undefined &&
    (typeof scaled !== "number" || scaled < 0 || scaled > 1)
  )
    return "score";
  if (judged && typeof scaled === "number" && session.masteryScore !== null) {
    if (verb === "passed" && scaled < session.masteryScore) return "mastery";
    if (verb === "failed" && scaled >= session.masteryScore) return "mastery";
  }
  const success = result?.success;
  if (
    verb === "passed"
      ? success !== true
      : verb === "failed"
        ? success !== false
        : success !== undefined
  )
    return "success";
  const completion = result?.completion;
  if (verb === "completed" ? completion !== true : completion !== undefined)
    return "completion";
  if (
    (verb === "completed" || judged || verb === "terminated") &&
    typeof result?.duration !== "string"
  )
    return "duration";
  const moving = success !== undefined || completion !== undefined;
  if (moving !== categoriesOf(statement).includes(CMI5_MOVE_ON_CATEGORY))
    return "category";
  return null;
}

/** What a kept statement changes in its session and its AU's progress. */
export function afterStatement(
  received: unknown,
  session: Pick<Cmi5Session, "verbs" | "progress">,
): { verbs: string[]; progress: AuProgress } {
  const statement = received as Received;
  const verb = cmi5VerbOf(statement.verb?.id);
  if (!verb) return session;
  const scaled = statement.result?.score?.scaled;
  return {
    verbs: [...session.verbs, verb],
    progress: {
      ...session.progress,
      ...(verb === "completed" ? { completed: true } : {}),
      ...(verb === "passed" ? { passed: true } : {}),
      ...(verb === "failed" ? { failed: true } : {}),
      ...((verb === "passed" || verb === "failed") && typeof scaled === "number"
        ? { score: scaled }
        : {}),
    },
  };
}
