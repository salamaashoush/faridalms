import {
  announcementRefSchema,
  feedQuerySchema,
  manageQuerySchema,
  publishAnnouncementSchema,
  reportQuerySchema,
  saveAnnouncementSchema,
  seenSchema,
} from "@faridalms/domain/announcements";
import { reviewTranslationSchema } from "@faridalms/domain/translations";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

const announcements = () => backend().announcements;

export const getAnnouncementFeed = createServerFn({ method: "GET" })
  .validator(checked(feedQuerySchema))
  .handler(({ data }) => announcements().feed(data));

export const getManagedAnnouncements = createServerFn({ method: "GET" })
  .validator(checked(manageQuerySchema))
  .handler(({ data }) => announcements().manage(data));

export const getAnnouncementOptions = createServerFn({ method: "GET" }).handler(
  () => announcements().options(),
);

export const getAnnouncementEditor = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(announcements().editor(data)));

export const getAnnouncement = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(announcements().record(data)));

export const saveAnnouncement = createServerFn({ method: "POST" })
  .validator(checked(saveAnnouncementSchema))
  .handler(({ data }) => announcements().save(data));

export const publishAnnouncement = createServerFn({ method: "POST" })
  .validator(checked(publishAnnouncementSchema))
  .handler(({ data }) => announcements().publish(data));

export const unpublishAnnouncement = createServerFn({ method: "POST" })
  .validator(checked(announcementRefSchema))
  .handler(({ data }) => announcements().unpublish(data));

export const archiveAnnouncement = createServerFn({ method: "POST" })
  .validator(checked(announcementRefSchema))
  .handler(({ data }) => announcements().archive(data));

export const markAnnouncementSeen = createServerFn({ method: "POST" })
  .validator(checked(seenSchema))
  .handler(({ data }) => announcements().seen(data));

export const reviewAnnouncementTranslation = createServerFn({ method: "POST" })
  .validator(checked(reviewTranslationSchema))
  .handler(({ data }) => announcements().review(data));

export const duplicateAnnouncement = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => announcements().duplicate(data));

export const getAnnouncementReport = createServerFn({ method: "GET" })
  .validator(checked(reportQuerySchema))
  .handler(({ data }) => announcements().report(data));
