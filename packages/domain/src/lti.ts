import * as v from "valibot";

/**
 * Outside tools a school plugs in by LTI 1.3, 1EdTech's standard for
 * launching a tool from a course with the person and their role carried
 * across, signed: a simulation, a publisher's exercises, a coding site.
 * The school is the platform; each tool is registered with it once.
 */

export const LTI_VERSION = "1.3.0";

const LTI = "https://purl.imsglobal.org/spec/lti/claim";
export const LTI_CLAIM = {
  messageType: `${LTI}/message_type`,
  version: `${LTI}/version`,
  deploymentId: `${LTI}/deployment_id`,
  targetLinkUri: `${LTI}/target_link_uri`,
  resourceLink: `${LTI}/resource_link`,
  roles: `${LTI}/roles`,
  context: `${LTI}/context`,
  launchPresentation: `${LTI}/launch_presentation`,
  custom: `${LTI}/custom`,
  toolPlatform: `${LTI}/tool_platform`,
} as const;

const MEMBERSHIP = "http://purl.imsglobal.org/vocab/lis/v2/membership";
const INSTITUTION = "http://purl.imsglobal.org/vocab/lis/v2/institution/person";
export const LTI_ROLES = {
  instructor: [`${MEMBERSHIP}#Instructor`, `${INSTITUTION}#Faculty`],
  learner: [`${MEMBERSHIP}#Learner`, `${INSTITUTION}#Student`],
} as const;

export const COURSE_OFFERING =
  "http://purl.imsglobal.org/vocab/lis/v2/course#CourseOffering";

/** The most custom parameters one tool or link carries. */
export const MAX_CUSTOM = 20;
/** The most addresses a tool may ask its launches be posted back to. */
export const MAX_REDIRECTS = 5;

const https = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(500),
  v.url("lti.url"),
  v.startsWith("https://", "lti.https"),
);

/** Names a tool reads as `custom` parameters; their values are words. */
export const ltiCustomSchema = v.pipe(
  v.record(
    v.pipe(v.string(), v.regex(/^[A-Za-z0-9_]{1,60}$/)),
    v.pipe(v.string(), v.maxLength(500)),
  ),
  v.check(
    (custom) => Object.keys(custom).length <= MAX_CUSTOM,
    "lti.custom_too_many",
  ),
);

export const saveToolSchema = v.object({
  id: v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
  expectedVersion: v.optional(v.pipe(v.number(), v.integer()), 0),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120)),
  /** Where the tool starts a sign-in, its "OIDC login initiation" address. */
  loginUrl: https,
  /** The tool's own launch address, used where a link names none. */
  launchUrl: https,
  /** Where the tool may ask launches to be posted back, exactly as written. */
  redirectUrls: v.pipe(
    v.array(https),
    v.minLength(1),
    v.maxLength(MAX_REDIRECTS),
  ),
  /** The tool's public keys, as a JWK set. */
  jwksUrl: https,
  /** Where the tool lets a teacher pick its content to place; none when it cannot. */
  deepLinkUrl: v.optional(v.union([v.literal(""), https]), ""),
  /** Whether launches carry the person's name and email, or only an id. */
  sendNames: v.boolean(),
  custom: v.optional(ltiCustomSchema, {}),
});
export type SaveTool = v.InferOutput<typeof saveToolSchema>;

export const toolRefSchema = v.object({ id: v.pipe(v.string(), v.uuid()) });

/** A document holding links to outside tools: a lesson or an assignment's brief. */
export const LTI_HOSTS = ["lesson", "assignment"] as const;
export type LtiHost = (typeof LTI_HOSTS)[number];

/**
 * The grade a tool's content asks to report into, as Deep Linking gives it:
 * a label, the most it scores, and the tool's own names for it.
 */
export const ltiLineItemSchema = v.object({
  label: v.pipe(v.string(), v.maxLength(200)),
  scoreMaximum: v.pipe(v.number(), v.minValue(0.01), v.maxValue(100000)),
  resourceId: v.optional(v.pipe(v.string(), v.maxLength(255))),
  tag: v.optional(v.pipe(v.string(), v.maxLength(255))),
});
export type LtiLineItem = v.InferOutput<typeof ltiLineItemSchema>;

/**
 * A link to an outside tool placed in a document: the tool, the link's own
 * id, which a copied link gets anew as LTI asks, what it is called, and
 * the address and custom parameters a tool's chosen content gave it.
 */
export const ltiLinkSchema = v.object({
  linkId: v.pipe(v.string(), v.uuid()),
  toolId: v.pipe(v.string(), v.uuid()),
  title: v.pipe(v.string(), v.maxLength(200)),
  text: v.optional(v.pipe(v.string(), v.maxLength(1000))),
  url: v.optional(https),
  custom: v.optional(ltiCustomSchema),
  lineItem: v.optional(ltiLineItemSchema),
});
export type LtiLink = v.InferOutput<typeof ltiLinkSchema>;

/** What a tool's chosen content gives a link, once checked. */
export type LtiPick = Pick<
  LtiLink,
  "title" | "text" | "url" | "custom" | "lineItem"
>;

const contentItemSchema = v.object({
  type: v.literal("ltiResourceLink"),
  title: v.optional(v.string(), ""),
  text: v.optional(v.string()),
  url: v.optional(https),
  custom: v.optional(ltiCustomSchema),
  lineItem: v.optional(
    v.object({
      label: v.optional(v.string()),
      scoreMaximum: v.pipe(v.number(), v.minValue(0.01), v.maxValue(100000)),
      resourceId: v.optional(v.pipe(v.string(), v.maxLength(255))),
      tag: v.optional(v.pipe(v.string(), v.maxLength(255))),
    }),
  ),
});

/**
 * A link's fields from content a tool hands back, an `ltiResourceLink`
 * content item as Deep Linking gives it: a long title or description is
 * cut to fit, and a grade with no label is named by the title. Anything
 * else, or an item that breaks the rules, gives nothing.
 */
export function ltiPickOf(item: unknown): LtiPick | null {
  const parsed = v.safeParse(contentItemSchema, item);
  if (!parsed.success) return null;
  const { text, url, custom, lineItem } = parsed.output;
  const title = parsed.output.title.trim().slice(0, 200);
  const label = lineItem?.label?.trim() || title;
  return {
    title,
    ...(text?.trim() ? { text: text.trim().slice(0, 1000) } : {}),
    ...(url ? { url } : {}),
    ...(custom && Object.keys(custom).length > 0 ? { custom } : {}),
    ...(lineItem
      ? { lineItem: { ...lineItem, label: label.slice(0, 200) } }
      : {}),
  };
}

/** The channel an editor waits on for what a teacher picks in a tool's window. */
export const LTI_PICK_CHANNEL = "farida-lti-pick";

const DL = "https://purl.imsglobal.org/spec/lti-dl/claim";
export const LTI_DL_CLAIM = {
  settings: `${DL}/deep_linking_settings`,
  contentItems: `${DL}/content_items`,
  data: `${DL}/data`,
  msg: `${DL}/msg`,
  errormsg: `${DL}/errormsg`,
} as const;

/** The claim a launch names a course's grade services in, LTI's Assignment and Grade Services. */
export const LTI_AGS_CLAIM =
  "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint";

const AGS = "https://purl.imsglobal.org/spec/lti-ags/scope";
export const LTI_AGS_SCOPES = {
  lineItem: `${AGS}/lineitem`,
  lineItemRead: `${AGS}/lineitem.readonly`,
  resultRead: `${AGS}/result.readonly`,
  score: `${AGS}/score`,
} as const;

/** A time a tool sends, ISO 8601 with its zone, as LTI asks. */
const zoned = v.pipe(
  v.string(),
  v.regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/,
  ),
  v.check((value) => !Number.isNaN(Date.parse(value))),
  v.transform((value) => new Date(value)),
);
const optionalTime = v.optional(
  v.nullable(
    v.union([
      v.pipe(
        v.literal(""),
        v.transform(() => null),
      ),
      zoned,
    ]),
  ),
  null,
);
const optionalWord = v.optional(
  v.nullable(v.pipe(v.string(), v.maxLength(255))),
  null,
);

/** A column of grades as a tool writes it, the line item it posts or puts. */
export const agsLineItemSchema = v.object({
  label: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  scoreMaximum: v.pipe(v.number(), v.gtValue(0), v.maxValue(10_000_000)),
  resourceId: optionalWord,
  tag: optionalWord,
  resourceLinkId: v.optional(v.nullable(v.string())),
  startDateTime: optionalTime,
  endDateTime: optionalTime,
  gradesReleased: v.optional(v.nullable(v.boolean()), null),
});
export type AgsLineItem = v.InferOutput<typeof agsLineItemSchema>;

/** A score a tool sends for one student, the latest it has for them. */
export const agsScoreSchema = v.pipe(
  v.object({
    userId: v.pipe(v.string(), v.uuid()),
    timestamp: zoned,
    activityProgress: v.picklist([
      "Initialized",
      "Started",
      "InProgress",
      "Submitted",
      "Completed",
    ]),
    gradingProgress: v.picklist([
      "FullyGraded",
      "Pending",
      "PendingManual",
      "Failed",
      "NotReady",
    ]),
    scoreGiven: v.optional(
      v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(10_000_000))),
      null,
    ),
    scoreMaximum: v.optional(
      v.nullable(v.pipe(v.number(), v.gtValue(0), v.maxValue(10_000_000))),
      null,
    ),
    comment: v.optional(
      v.nullable(v.pipe(v.string(), v.maxLength(4000))),
      null,
    ),
    scoringUserId: v.optional(v.nullable(v.string()), null),
  }),
  v.check(
    (score) => score.scoreGiven === null || score.scoreMaximum !== null,
    "lti.score_maximum",
  ),
);
export type AgsScore = v.InferOutput<typeof agsScoreSchema>;
