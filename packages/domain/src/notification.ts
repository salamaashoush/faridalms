import * as v from "valibot";

import { contentDocumentSchema } from "./content";

export const NOTIFICATION_TYPES = [
  "assignment_published",
  "assessment_released",
  "message_received",
  "announcement_published",
  "newsletter_published",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const NOTIFICATION_CHANNELS = ["in_app", "email", "sms"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export const DELIVERY_STATES = [
  "pending",
  "sent",
  "failed",
  "skipped",
] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];
export const NOTIFICATION_LOCALES = ["en", "ar"] as const;
export const ANNOUNCEMENT_AUDIENCES = [
  "everyone",
  "parents",
  "students",
  "teachers",
] as const;
export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];
export const MAX_DELIVERY_ATTEMPTS = 5;

/** What a notification says, independent of channel and language. */
export interface NotificationPayload {
  title: string;
  preview: string;
  actorName: string | null;
  studentName: string | null;
  link: {
    kind: "assignment" | "message" | "announcement" | "newsletter";
    id: string;
    studentId?: string;
  };
}

const id = v.pipe(v.string(), v.uuid());

export const saveNotificationPreferencesSchema = v.object({
  email: v.boolean(),
  sms: v.boolean(),
  locale: v.picklist(NOTIFICATION_LOCALES),
  mutedTypes: v.optional(
    v.pipe(
      v.array(v.picklist(NOTIFICATION_TYPES)),
      v.maxLength(NOTIFICATION_TYPES.length),
    ),
    [],
  ),
});
export type SaveNotificationPreferencesInput = v.InferOutput<
  typeof saveNotificationPreferencesSchema
>;

export const notificationsQuerySchema = v.object({
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  unreadOnly: v.optional(v.boolean(), false),
});
export const markNotificationsReadSchema = v.object({
  ids: v.optional(v.pipe(v.array(id), v.maxLength(100)), []),
});
export const deliveryAuditQuerySchema = v.object({
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  q: v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
  state: v.optional(v.picklist(["all", ...DELIVERY_STATES]), "all"),
  channel: v.optional(v.picklist(["all", ...NOTIFICATION_CHANNELS]), "all"),
});

export const saveAnnouncementSchema = v.object({
  id,
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(0)),
  title: v.pipe(v.string(), v.trim(), v.maxLength(255)),
  document: contentDocumentSchema,
  audience: v.picklist(ANNOUNCEMENT_AUDIENCES),
});
export type SaveAnnouncementInput = v.InferOutput<
  typeof saveAnnouncementSchema
>;
export const announcementRevisionSchema = v.object({
  id,
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
export const publishNewsletterDraftSchema = v.object({
  id,
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  publishedOn: v.pipe(v.string(), v.isoDate()),
});

/**
 * Grows from the base delay (a minute in production) to half a day, so a
 * flapping provider is not hammered. Tests shrink the base to a second.
 */
export function retryDelayMs(attempt: number, baseMs = 60_000): number | null {
  const factors = [1, 5, 30, 120, 720];
  if (attempt >= MAX_DELIVERY_ATTEMPTS) return null;
  const factor = factors[attempt - 1] ?? factors.at(-1) ?? 1;
  return factor * baseMs;
}

const AUDIENCE_ROLES: Record<
  AnnouncementAudience,
  ("admin" | "teacher" | "parent" | "student")[]
> = {
  everyone: ["admin", "teacher", "parent", "student"],
  parents: ["parent"],
  students: ["student"],
  teachers: ["teacher"],
};

/** Which roles an announcement audience names. */
export function audienceRoles(audience: AnnouncementAudience) {
  return AUDIENCE_ROLES[audience];
}
