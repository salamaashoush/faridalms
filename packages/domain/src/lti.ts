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
});
export type LtiLink = v.InferOutput<typeof ltiLinkSchema>;
