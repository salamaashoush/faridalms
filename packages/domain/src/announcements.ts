import * as v from "valibot";

import { contentDocumentSchema } from "./content";
import { CONTENT_LOCALES } from "./translations";

export const ANNOUNCEMENT_STATES = [
  "draft",
  "scheduled",
  "published",
  "archived",
] as const;
export type AnnouncementState = (typeof ANNOUNCEMENT_STATES)[number];
export const URGENCIES = ["normal", "important", "urgent"] as const;
export type Urgency = (typeof URGENCIES)[number];
export const AUDIENCE_SCOPES = [
  "school",
  "staff",
  "families",
  "students",
  "class",
  "grade",
] as const;
export type AudienceScope = (typeof AUDIENCE_SCOPES)[number];

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const optionalDate = v.optional(
  v.union([v.literal(""), v.pipe(v.string(), v.isoDate())]),
  "",
);

export const audienceSchema = v.pipe(
  v.object({
    scope: v.picklist(AUDIENCE_SCOPES),
    classId: optionalId,
    gradeId: optionalId,
  }),
  v.check(
    (audience) =>
      (audience.scope === "class") === (audience.classId !== "") &&
      (audience.scope === "grade") === (audience.gradeId !== ""),
    "announcements.audience_target",
  ),
);
export type AudienceInput = v.InferOutput<typeof audienceSchema>;

export const feedQuerySchema = v.object({
  tab: v.optional(v.picklist(["current", "past"]), "current"),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
});
export type FeedQuery = v.InferOutput<typeof feedQuerySchema>;

export const MANAGE_TABS = [
  "drafts",
  "scheduled",
  "published",
  "archived",
] as const;
export const manageQuerySchema = v.object({
  tab: v.optional(v.picklist(MANAGE_TABS), "published"),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
});
export type ManageQuery = v.InferOutput<typeof manageQuerySchema>;

export const saveAnnouncementSchema = v.pipe(
  v.object({
    id: optionalId,
    expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
    primaryLocale: v.picklist(CONTENT_LOCALES),
    titleEn: v.pipe(v.string(), v.trim(), v.maxLength(200)),
    titleAr: v.pipe(v.string(), v.trim(), v.maxLength(200)),
    body: contentDocumentSchema,
    translation: v.nullable(contentDocumentSchema),
    audiences: v.pipe(v.array(audienceSchema), v.minLength(1), v.maxLength(20)),
    urgency: v.picklist(URGENCIES),
    pinnedUntil: optionalDate,
    expiresOn: optionalDate,
    requiresAck: v.boolean(),
    ackDueOn: optionalDate,
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
);
export type SaveAnnouncement = v.InferOutput<typeof saveAnnouncementSchema>;

export const publishAnnouncementSchema = v.object({
  id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  /** Empty to go out now, or when it should go out. */
  publishAt: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.isoTimestamp())]),
    "",
  ),
  /** For a published announcement: tell recipients it changed. */
  sendUpdate: v.optional(v.boolean(), false),
});

export const archiveAnnouncementSchema = v.object({
  id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const seenSchema = v.object({ id, acknowledge: v.boolean() });
