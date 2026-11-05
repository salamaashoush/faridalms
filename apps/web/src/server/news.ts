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

export const getNews = createServerFn({ method: "GET" })
  .validator(checked(newsListSchema))
  .handler(({ data }) => backend().news.list(data));

export const getManagedNews = createServerFn({ method: "GET" })
  .validator(checked(manageNewsSchema))
  .handler(({ data }) => backend().news.manage(data));

export const getNewsOptions = createServerFn({ method: "GET" }).handler(() =>
  backend().news.options(),
);

export const getNewsEditor = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().news.editor(data)));

export const getNewsPost = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().news.record(data)));

export const saveNews = createServerFn({ method: "POST" })
  .validator(checked(saveNewsSchema))
  .handler(({ data }) => backend().news.save(data));

export const publishNews = createServerFn({ method: "POST" })
  .validator(checked(publishNewsSchema))
  .handler(({ data }) => backend().news.publish(data));

export const reviewNewsTranslation = createServerFn({ method: "POST" })
  .validator(checked(reviewTranslationSchema))
  .handler(({ data }) => backend().news.review(data));

export const unpublishNews = createServerFn({ method: "POST" })
  .validator(checked(newsRefSchema))
  .handler(({ data }) => backend().news.unpublish(data));

export const archiveNews = createServerFn({ method: "POST" })
  .validator(checked(newsRefSchema))
  .handler(({ data }) => backend().news.archive(data));

export const duplicateNews = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => backend().news.duplicate(data));

export const markNewsSeen = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => backend().news.seen(data));

export const getNewsReport = createServerFn({ method: "GET" })
  .validator(checked(reportQuerySchema))
  .handler(({ data }) => backend().news.report(data));
