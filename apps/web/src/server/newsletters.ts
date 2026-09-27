import {
  listQuerySchema,
  manageNewslettersSchema,
  newsletterRefSchema,
  publishNewsletterSchema,
  saveNewsletterSchema,
} from "@faridalms/domain/newsletters";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

export const getNewsletters = createServerFn({ method: "GET" })
  .validator(checked(listQuerySchema))
  .handler(({ data }) => backend().newsletters.list(data));

export const getManagedNewsletters = createServerFn({ method: "GET" })
  .validator(checked(manageNewslettersSchema))
  .handler(({ data }) => backend().newsletters.manage(data));

export const getNewsletterOptions = createServerFn({ method: "GET" }).handler(
  () => backend().newsletters.options(),
);

export const getNewsletterEditor = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().newsletters.editor(data)));

export const getNewsletter = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().newsletters.record(data)));

export const saveNewsletter = createServerFn({ method: "POST" })
  .validator(checked(saveNewsletterSchema))
  .handler(({ data }) => backend().newsletters.save(data));

export const publishNewsletter = createServerFn({ method: "POST" })
  .validator(checked(publishNewsletterSchema))
  .handler(({ data }) => backend().newsletters.publish(data));

export const archiveNewsletter = createServerFn({ method: "POST" })
  .validator(checked(newsletterRefSchema))
  .handler(({ data }) => backend().newsletters.archive(data));

export const duplicateNewsletter = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => backend().newsletters.duplicate(data));

export const markNewsletterSeen = createServerFn({ method: "POST" })
  .validator(byId)
  .handler(({ data }) => backend().newsletters.seen(data));
