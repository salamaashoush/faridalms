import {
  archiveAnnouncementSchema,
  feedQuerySchema,
  manageQuerySchema,
  publishAnnouncementSchema,
  saveAnnouncementSchema,
  seenSchema,
} from "@faridalms/domain/announcements";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

export const getAnnouncementFeed = createServerFn({ method: "GET" })
  .validator(checked(feedQuerySchema))
  .handler(({ data }) => backend().announcements.feed(data));

export const getManagedAnnouncements = createServerFn({ method: "GET" })
  .validator(checked(manageQuerySchema))
  .handler(({ data }) => backend().announcements.manage(data));

export const getAnnouncementOptions = createServerFn({ method: "GET" }).handler(
  () => backend().announcements.options(),
);

export const getAnnouncementEditor = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().announcements.editor(data)));

export const getAnnouncement = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().announcements.record(data)));

export const saveAnnouncement = createServerFn({ method: "POST" })
  .validator(checked(saveAnnouncementSchema))
  .handler(({ data }) => backend().announcements.save(data));

export const publishAnnouncement = createServerFn({ method: "POST" })
  .validator(checked(publishAnnouncementSchema))
  .handler(({ data }) => backend().announcements.publish(data));

export const archiveAnnouncement = createServerFn({ method: "POST" })
  .validator(checked(archiveAnnouncementSchema))
  .handler(({ data }) => backend().announcements.archive(data));

export const markAnnouncementSeen = createServerFn({ method: "POST" })
  .validator(checked(seenSchema))
  .handler(({ data }) => backend().announcements.seen(data));
