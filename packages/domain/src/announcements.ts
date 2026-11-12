import * as v from "valibot";

import { contentDocumentSchema } from "./content";
import { pageField } from "./paging";
import { CONTENT_LOCALES } from "./translations";
import { siteSlugSchema } from "./website";

export const URGENCIES = ["normal", "important", "urgent"] as const;
export type Urgency = (typeof URGENCIES)[number];
export const AUDIENCE_SCOPES = [
  "school",
  "staff",
  "families",
  "students",
  "class",
] as const;
export type AudienceScope = (typeof AUDIENCE_SCOPES)[number];

/**
 * Where an announcement can be read: only inside the school by its
 * audience, or on the school's website as well.
 */
export const VISIBILITIES = ["school", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const optionalDate = v.optional(
  v.union([v.literal(""), v.pipe(v.string(), v.isoDate())]),
  "",
);
const version = (min: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min));
const words = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));

/**
 * One audience: a scope of the school's own, with the class for `class`, or
 * a scope a module answers for (a grade, say) with the target it names.
 */
export const audienceSchema = v.pipe(
  v.object({
    scope: v.pipe(v.string(), v.regex(/^[a-z_]{1,20}$/)),
    classId: optionalId,
    targetId: optionalId,
  }),
  v.check(
    (audience) =>
      (audience.scope === "class") === (audience.classId !== "") &&
      (AUDIENCE_SCOPES as readonly string[]).includes(audience.scope) ===
        (audience.targetId === ""),
    "announcements.audience_target",
  ),
);
export type AudienceInput = v.InferOutput<typeof audienceSchema>;

export const feedQuerySchema = v.object({
  tab: v.optional(v.picklist(["current", "past"]), "current"),
  q: v.optional(words(100), ""),
  page: pageField,
});
export type FeedQuery = v.InferOutput<typeof feedQuerySchema>;

export const MANAGE_TABS = [
  "drafts",
  "scheduled",
  "published",
  "archived",
] as const;
export type ManageTab = (typeof MANAGE_TABS)[number];
export const manageQuerySchema = v.object({
  tab: v.optional(v.picklist(MANAGE_TABS), "published"),
  q: v.optional(words(100), ""),
  page: pageField,
});
export type ManageQuery = v.InferOutput<typeof manageQuerySchema>;

/** A page of the people an announcement reached, narrowed by name. */
export const reportQuerySchema = v.object({
  id,
  q: v.optional(words(100), ""),
  page: pageField,
});
export type ReportQuery = v.InferInput<typeof reportQuerySchema>;

export const saveAnnouncementSchema = v.pipe(
  v.object({
    id: optionalId,
    expectedVersion: version(0),
    primaryLocale: v.picklist(CONTENT_LOCALES),
    titleEn: words(200),
    titleAr: words(200),
    body: contentDocumentSchema,
    translation: v.nullable(contentDocumentSchema),
    /** Who is told when it goes out; only one on the website may tell nobody. */
    audiences: v.pipe(v.array(audienceSchema), v.maxLength(20)),
    urgency: v.optional(v.picklist(URGENCIES), "normal"),
    pinnedUntil: optionalDate,
    expiresOn: optionalDate,
    requiresAck: v.optional(v.boolean(), false),
    ackDueOn: optionalDate,
    visibility: v.optional(v.picklist(VISIBILITIES), "school"),
    excerptEn: v.optional(words(300), ""),
    excerptAr: v.optional(words(300), ""),
    slug: v.optional(v.union([v.literal(""), siteSlugSchema]), ""),
    categoryId: optionalId,
    coverFileId: optionalId,
    coverAltEn: v.optional(words(300), ""),
    coverAltAr: v.optional(words(300), ""),
    /** First among the website's posts. */
    pinned: v.optional(v.boolean(), false),
  }),
  v.forward(
    v.check(
      (input) => input.ackDueOn === "" || input.requiresAck,
      "announcements.ack_due_without_ack",
    ),
    ["ackDueOn"],
  ),
  v.forward(
    v.check(
      (input) =>
        (input.primaryLocale === "ar" ? input.titleAr : input.titleEn) !== "",
      "announcements.title",
    ),
    ["titleEn"],
  ),
  v.forward(
    v.check(
      (input) => input.visibility === "public" || input.audiences.length > 0,
      "announcements.audience",
    ),
    ["audiences"],
  ),
  v.forward(
    v.check(
      (input) => input.visibility === "school" || input.slug !== "",
      "announcements.slug",
    ),
    ["slug"],
  ),
);
export type SaveAnnouncement = v.InferOutput<typeof saveAnnouncementSchema>;

export const publishAnnouncementSchema = v.object({
  id,
  expectedVersion: version(1),
  /** Empty to go out now, or when it should go out. */
  publishAt: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.isoTimestamp())]),
    "",
  ),
  /** For a published announcement: replace what its readers have. */
  sendUpdate: v.optional(v.boolean(), false),
  /** With an update: replace it without telling them or showing it unread again. */
  quietly: v.optional(v.boolean(), false),
});

export const announcementRefSchema = v.object({
  id,
  expectedVersion: version(1),
});

export const seenSchema = v.object({ id, acknowledge: v.boolean() });
