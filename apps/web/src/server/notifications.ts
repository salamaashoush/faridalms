import {
  announcementRevisionSchema,
  deliveryAuditQuerySchema,
  markNotificationsReadSchema,
  notificationsQuerySchema,
  publishNewsletterDraftSchema,
  saveAnnouncementSchema,
  saveNotificationPreferencesSchema,
} from "@faridalms/domain/notification";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";

const id = v.pipe(v.string(), v.uuid());
const page = v.object({
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});

export const getNotifications = createServerFn({ method: "GET" })
  .inputValidator(notificationsQuerySchema)
  .handler(({ data }) => backend().getNotifications(data));
export const getUnreadNotificationCount = createServerFn({
  method: "GET",
}).handler(() => backend().getUnreadNotificationCount());
export const markNotificationsRead = createServerFn({ method: "POST" })
  .inputValidator(markNotificationsReadSchema)
  .handler(({ data }) => backend().markNotificationsRead(data));
export const getNotificationPreferences = createServerFn({
  method: "GET",
}).handler(() => backend().getNotificationPreferences());
export const saveNotificationPreferences = createServerFn({ method: "POST" })
  .inputValidator(saveNotificationPreferencesSchema)
  .handler(({ data }) => backend().saveNotificationPreferences(data));
export const getNotificationAudit = createServerFn({ method: "GET" })
  .inputValidator(deliveryAuditQuerySchema)
  .handler(({ data }) => backend().getNotificationAudit(data));

export const getAnnouncements = createServerFn({ method: "GET" })
  .inputValidator(page)
  .handler(({ data }) => backend().getAnnouncements(data));
export const getAnnouncement = createServerFn({ method: "GET" })
  .inputValidator(v.object({ id }))
  .handler(({ data }) => backend().getAnnouncement(data));
export const saveAnnouncement = createServerFn({ method: "POST" })
  .inputValidator(saveAnnouncementSchema)
  .handler(({ data }) => backend().saveAnnouncement(data));
export const publishAnnouncement = createServerFn({ method: "POST" })
  .inputValidator(announcementRevisionSchema)
  .handler(({ data }) => backend().publishAnnouncement(data));
export const deleteAnnouncement = createServerFn({ method: "POST" })
  .inputValidator(announcementRevisionSchema)
  .handler(({ data }) => backend().deleteAnnouncement(data));
export const publishNewsletterDraft = createServerFn({ method: "POST" })
  .inputValidator(publishNewsletterDraftSchema)
  .handler(({ data }) => backend().publishNewsletterDraft(data));
export const getNewsletter = createServerFn({ method: "GET" })
  .inputValidator(v.object({ id }))
  .handler(({ data }) => backend().getNewsletter(data));
