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
  forUser: `${LTI}/for_user`,
} as const;

const MEMBERSHIP = "http://purl.imsglobal.org/vocab/lis/v2/membership";
const INSTITUTION = "http://purl.imsglobal.org/vocab/lis/v2/institution/person";
export const LTI_ROLES = {
  instructor: [`${MEMBERSHIP}#Instructor`, `${INSTITUTION}#Faculty`],
  learner: [`${MEMBERSHIP}#Learner`, `${INSTITUTION}#Student`],
} as const;

/** A context role a tool may name by its short form, as Names and Roles allows. */
export const LTI_CONTEXT_ROLES = {
  Instructor: `${MEMBERSHIP}#Instructor`,
  Learner: `${MEMBERSHIP}#Learner`,
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
  /** Where the tool shows a student's work behind a score; none for its launch address. */
  reviewUrl: v.optional(v.union([v.literal(""), https]), ""),
  /** Whether launches carry the person's name and email, or only an id. */
  sendNames: v.boolean(),
  /** Whether the tool may keep grades in its courses, Assignment and Grade Services. */
  grades: v.optional(v.boolean(), true),
  /** Whether the tool may read its courses' class lists, Names and Role Provisioning. */
  roster: v.optional(v.boolean(), false),
  custom: v.optional(ltiCustomSchema, {}),
});
export type SaveTool = v.InferOutput<typeof saveToolSchema>;

export const toolRefSchema = v.object({ id: v.pipe(v.string(), v.uuid()) });

/** A tool that registered itself, put to use once the school has looked at it. */
export const activateToolSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  expectedVersion: v.pipe(v.number(), v.integer()),
});

/** The address a tool's maker gives for registering it, LTI Dynamic Registration. */
export const registerToolSchema = v.object({ url: https });

/** How tall a tool shown in the page may be, and how tall it starts. */
export const LTI_FRAME_HEIGHTS = { least: 200, most: 2000, usual: 600 };

/** A document holding links to outside tools: a lesson or an assignment's brief. */
export const LTI_HOSTS = ["lesson", "assignment"] as const;
export type LtiHost = (typeof LTI_HOSTS)[number];

/**
 * That a tool can show the work behind a score in its column, LTI's
 * Submission Review: what to call the way there, the address to launch
 * when not the link's own, and parameters for that launch.
 */
export const submissionReviewSchema = v.object({
  label: v.optional(v.pipe(v.string(), v.maxLength(200))),
  url: v.optional(https),
  custom: v.optional(ltiCustomSchema),
});
export type SubmissionReview = v.InferOutput<typeof submissionReviewSchema>;

/**
 * The grade a tool's content asks to report into, as Deep Linking gives it:
 * a label, the most it scores, and the tool's own names for it.
 */
export const ltiLineItemSchema = v.object({
  label: v.pipe(v.string(), v.maxLength(200)),
  scoreMaximum: v.pipe(v.number(), v.minValue(0.01), v.maxValue(100000)),
  resourceId: v.optional(v.pipe(v.string(), v.maxLength(255))),
  tag: v.optional(v.pipe(v.string(), v.maxLength(255))),
  submissionReview: v.optional(submissionReviewSchema),
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
  /** Shown in the page in a frame this tall, rather than opened in a window. */
  frame: v.optional(
    v.object({
      height: v.pipe(
        v.number(),
        v.integer(),
        v.minValue(LTI_FRAME_HEIGHTS.least),
        v.maxValue(LTI_FRAME_HEIGHTS.most),
      ),
    }),
  ),
});
export type LtiLink = v.InferOutput<typeof ltiLinkSchema>;

/** What a tool's chosen content gives a link, once checked. */
export type LtiPick = Pick<
  LtiLink,
  "title" | "text" | "url" | "custom" | "lineItem" | "frame"
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
      submissionReview: v.optional(submissionReviewSchema),
    }),
  ),
  iframe: v.optional(v.object({ height: v.optional(v.number()) })),
});

/** A height a tool asks for, within what the page allows. */
const frameHeight = (height: number | undefined) =>
  Math.round(
    Math.min(
      LTI_FRAME_HEIGHTS.most,
      Math.max(LTI_FRAME_HEIGHTS.least, height ?? LTI_FRAME_HEIGHTS.usual),
    ),
  );

/**
 * A link's fields from content a tool hands back, an `ltiResourceLink`
 * content item as Deep Linking gives it: a long title or description is
 * cut to fit, and a grade with no label is named by the title. Anything
 * else, or an item that breaks the rules, gives nothing.
 */
export function ltiPickOf(item: unknown): LtiPick | null {
  const parsed = v.safeParse(contentItemSchema, item);
  if (!parsed.success) return null;
  const { text, url, custom, lineItem, iframe } = parsed.output;
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
    ...(iframe ? { frame: { height: frameHeight(iframe.height) } } : {}),
  };
}

/** The most a tool may hand back in one pick, and the most HTML in one item. */
export const LTI_MOST_PICKED = 20;
export const LTI_MOST_HTML = 100_000;

const linkItemSchema = v.object({
  type: v.literal("link"),
  url: https,
  title: v.optional(v.string(), ""),
  text: v.optional(v.string()),
  iframe: v.optional(v.object({ src: https })),
  embed: v.optional(
    v.object({ html: v.pipe(v.string(), v.maxLength(LTI_MOST_HTML)) }),
  ),
});

const htmlItemSchema = v.object({
  type: v.literal("html"),
  html: v.pipe(v.string(), v.minLength(1), v.maxLength(LTI_MOST_HTML)),
  title: v.optional(v.string(), ""),
});

/**
 * One piece of content a tool hands back, as the editor places it: a link
 * to launch the tool, an address on the web, or a passage of the tool's
 * HTML, which the editor reads as a paste is, so nothing in it runs.
 */
export type LtiPicked =
  | { type: "lti"; pick: LtiPick }
  | {
      type: "link";
      url: string;
      title: string;
      text?: string;
      /** The page's address for showing it in a frame, when the tool gives one. */
      frame?: string;
    }
  | { type: "html"; html: string; title: string };

/** The kinds of content a teacher's pick takes from a tool. */
export const LTI_ACCEPT_TYPES = ["ltiResourceLink", "link", "html"] as const;

/**
 * The content a tool hands back from a pick, each item as the editor places
 * it, at most twenty; an item of another kind, or one that breaks the
 * rules, is left out and counted, so the teacher can be told.
 */
export function ltiPickedOf(items: unknown): {
  picked: LtiPicked[];
  refused: number;
} {
  const list = Array.isArray(items) ? (items as unknown[]) : [];
  const picked: LtiPicked[] = [];
  for (const item of list.slice(0, LTI_MOST_PICKED)) {
    const pick = ltiPickOf(item);
    if (pick) {
      picked.push({ type: "lti", pick });
      continue;
    }
    const link = v.safeParse(linkItemSchema, item);
    if (link.success) {
      const { url, iframe, embed, text } = link.output;
      const title = link.output.title.trim().slice(0, 200);
      picked.push(
        embed?.html.trim()
          ? { type: "html", html: embed.html, title }
          : {
              type: "link",
              url,
              title,
              ...(text?.trim() ? { text: text.trim().slice(0, 1000) } : {}),
              ...(iframe ? { frame: iframe.src } : {}),
            },
      );
      continue;
    }
    const html = v.safeParse(htmlItemSchema, item);
    if (html.success)
      picked.push({
        type: "html",
        html: html.output.html,
        title: html.output.title.trim().slice(0, 200),
      });
  }
  return { picked, refused: list.length - picked.length };
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

/** The claim a launch names a course's class list in, LTI's Names and Role Provisioning Services. */
export const LTI_NRPS_CLAIM =
  "https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice";
export const LTI_NRPS_SCOPE =
  "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly";

/** The scopes a tool may be given, by the services the school lets it use. */
export function ltiScopesOf(tool: { grades: boolean; roster: boolean }) {
  return [
    ...(tool.grades ? Object.values(LTI_AGS_SCOPES) : []),
    ...(tool.roster ? [LTI_NRPS_SCOPE] : []),
  ];
}

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
  submissionReview: v.optional(v.nullable(submissionReviewSchema), null),
});
export type AgsLineItem = v.InferOutput<typeof agsLineItemSchema>;

/** How far a student has got with a tool's activity, as the tool reports it. */
export const LTI_ACTIVITY_PROGRESS = [
  "Initialized",
  "Started",
  "InProgress",
  "Submitted",
  "Completed",
] as const;
/** How far a tool has got marking a student's work. */
export const LTI_GRADING_PROGRESS = [
  "FullyGraded",
  "Pending",
  "PendingManual",
  "Failed",
  "NotReady",
] as const;
export type LtiGradingProgress = (typeof LTI_GRADING_PROGRESS)[number];

/** A score a tool sends for one student, the latest it has for them. */
export const agsScoreSchema = v.pipe(
  v.object({
    userId: v.pipe(v.string(), v.uuid()),
    timestamp: zoned,
    activityProgress: v.picklist(LTI_ACTIVITY_PROGRESS),
    gradingProgress: v.picklist(LTI_GRADING_PROGRESS),
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

/** LTI Dynamic Registration's names for what a tool and the school say of themselves. */
export const LTI_TOOL_CONFIGURATION =
  "https://purl.imsglobal.org/spec/lti-tool-configuration";
export const LTI_PLATFORM_CONFIGURATION =
  "https://purl.imsglobal.org/spec/lti-platform-configuration";

/** The messages the school sends tools, which a tool's registration may name. */
export const LTI_MESSAGES = [
  "LtiResourceLinkRequest",
  "LtiDeepLinkingRequest",
  "LtiSubmissionReviewRequest",
] as const;

const domainName = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.regex(/^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/),
);

const registrationSchema = v.object({
  application_type: v.optional(v.literal("web")),
  grant_types: v.pipe(
    v.array(v.string()),
    v.check(
      (grants) =>
        grants.includes("client_credentials") && grants.includes("implicit"),
    ),
  ),
  response_types: v.pipe(
    v.array(v.string()),
    v.check((types) => types.includes("id_token")),
  ),
  initiate_login_uri: https,
  redirect_uris: v.pipe(
    v.array(https),
    v.minLength(1),
    v.maxLength(MAX_REDIRECTS),
  ),
  client_name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  jwks_uri: https,
  token_endpoint_auth_method: v.literal("private_key_jwt"),
  scope: v.optional(v.pipe(v.string(), v.maxLength(2000)), ""),
  logo_uri: v.optional(https),
  client_uri: v.optional(https),
  tos_uri: v.optional(https),
  policy_uri: v.optional(https),
  contacts: v.optional(
    v.pipe(v.array(v.pipe(v.string(), v.maxLength(200))), v.maxLength(10)),
  ),
  [LTI_TOOL_CONFIGURATION]: v.object({
    domain: domainName,
    secondary_domains: v.optional(v.pipe(v.array(domainName), v.maxLength(10))),
    target_link_uri: https,
    custom_parameters: v.optional(ltiCustomSchema),
    description: v.optional(v.pipe(v.string(), v.maxLength(1000))),
    claims: v.optional(
      v.pipe(v.array(v.pipe(v.string(), v.maxLength(100))), v.maxLength(50)),
    ),
    messages: v.optional(
      v.pipe(
        v.array(
          v.object({
            type: v.pipe(v.string(), v.maxLength(100)),
            target_link_uri: v.optional(https),
            label: v.optional(v.pipe(v.string(), v.maxLength(200))),
          }),
        ),
        v.maxLength(20),
      ),
    ),
  }),
});

/** What a tool asked for in registering itself, kept for the school to look at. */
export interface ToolRegistration {
  domain: string;
  description: string | null;
  logoUrl: string | null;
  homeUrl: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  contacts: string[];
  /** The identity claims the tool asked launches to carry. */
  claims: string[];
  /** The services the tool asked to use, which the school grants or not. */
  asked: { grades: boolean; roster: boolean };
}

/**
 * A tool's request to register itself, as LTI Dynamic Registration sends
 * it, read into the tool the school would keep, or the error to answer
 * with. Every address it would be launched at, or post launches back to,
 * must lie in the domains it names, so a registration cannot point the
 * school's launches somewhere its maker does not control. Names and the
 * class list are never given at registration; the school decides.
 */
export function toolRegistrationOf(body: unknown):
  | {
      tool: Omit<SaveTool, "id" | "expectedVersion">;
      registration: ToolRegistration;
    }
  | { error: "invalid_client_metadata" | "invalid_redirect_uri" } {
  const parsed = v.safeParse(registrationSchema, body);
  if (!parsed.success) return { error: "invalid_client_metadata" };
  const request = parsed.output;
  const lti = request[LTI_TOOL_CONFIGURATION];
  const domains = [lti.domain, ...(lti.secondary_domains ?? [])];
  const covered = (address: string) => {
    const { host } = new URL(address);
    return domains.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
  };
  const message = (type: string) =>
    lti.messages?.find((each) => each.type === type);
  const deepLinking = message("LtiDeepLinkingRequest");
  const review = message("LtiSubmissionReviewRequest");
  const deepLinkUrl = deepLinking
    ? (deepLinking.target_link_uri ?? lti.target_link_uri)
    : "";
  const reviewUrl = review?.target_link_uri ?? "";
  const addresses = [
    request.initiate_login_uri,
    lti.target_link_uri,
    ...request.redirect_uris,
    ...(deepLinkUrl ? [deepLinkUrl] : []),
    ...(reviewUrl ? [reviewUrl] : []),
  ];
  if (!addresses.every(covered)) return { error: "invalid_redirect_uri" };
  const scopes = request.scope.split(" ").filter(Boolean);
  const agsScopes: string[] = Object.values(LTI_AGS_SCOPES);
  const asked = {
    grades: scopes.some((scope) => agsScopes.includes(scope)),
    roster: scopes.includes(LTI_NRPS_SCOPE),
  };
  return {
    tool: {
      name: request.client_name.slice(0, 120),
      loginUrl: request.initiate_login_uri,
      launchUrl: lti.target_link_uri,
      redirectUrls: [...new Set(request.redirect_uris)],
      jwksUrl: request.jwks_uri,
      deepLinkUrl,
      reviewUrl,
      sendNames: false,
      grades: asked.grades,
      roster: false,
      custom: lti.custom_parameters ?? {},
    },
    registration: {
      domain: lti.domain,
      description: lti.description?.trim() || null,
      logoUrl: request.logo_uri ?? null,
      homeUrl: request.client_uri ?? null,
      termsUrl: request.tos_uri ?? null,
      privacyUrl: request.policy_uri ?? null,
      contacts: request.contacts ?? [],
      claims: lti.claims ?? [],
      asked,
    },
  };
}
