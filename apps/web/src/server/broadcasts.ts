import {
  archiveAnnouncementSchema,
  feedQuerySchema,
  manageQuerySchema,
  publishAnnouncementSchema,
  saveAnnouncementSchema,
  seenSchema,
} from "@faridalms/domain/announcements";
import { reportQuerySchema } from "@faridalms/domain/broadcasts";
import {
  manageNewsSchema,
  newsListSchema,
  newsRefSchema,
  publishNewsSchema,
  saveNewsSchema,
} from "@faridalms/domain/news";
import { reviewTranslationSchema } from "@faridalms/domain/translations";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

const announcements = () => backend().broadcasts.announcements;
const news = () => backend().broadcasts.news;

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

export const archiveAnnouncement = createServerFn({ method: "POST" })
  .validator(checked(archiveAnnouncementSchema))
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

export const getNews = createServerFn({ method: "GET" })
  .validator(checked(newsListSchema))
  .handler(({ data }) => news().list(data));

export const getManagedNews = createServerFn({ method: "GET" })
  .validator(checked(manageNewsSchema))
  .handler(({ data }) => news().manage(data));

export const getNewsOptions = createServerFn({ method: "GET" }).handler(() =>
  news().options(),
);

export const getNewsEditor = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(news().editor(data)));

export const getNewsPost = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(news().record(data)));

export const saveNews = createServerFn({ method: "POST" })
  .validator(checked(saveNewsSchema))
  .handler(({ data }) => news().save(data));

export const publishNews = createServerFn({ method: "POST" })
  .validator(checked(publishNewsSchema))
  .handler(({ data }) => news().publish(data));

export const reviewNewsTranslation = createServerFn({ method: "POST" })
  .validator(checked(reviewTranslationSchema))
  .handler(({ data }) => news().review(data));

export const unpublishNews = createServerFn({ method: "POST" })
  .validator(checked(newsRefSchema))
  .handler(({ data }) => news().unpublish(data));

export const archiveNews = createServerFn({ method: "POST" })
  .validator(checked(newsRefSchema))
  .handler(({ data }) => news().archive(data));

export const duplicateNews = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => news().duplicate(data));

export const markNewsSeen = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => news().seen(data));

export const getNewsReport = createServerFn({ method: "GET" })
  .validator(checked(reportQuerySchema))
  .handler(({ data }) => news().report(data));
