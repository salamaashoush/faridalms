import type { ManageNewslettersQuery } from "@faridalms/domain/newsletters";

import { queryOptions } from "@tanstack/react-query";

import {
  getManagedNewsletters,
  getNewsletter,
  getNewsletterEditor,
  getNewsletterOptions,
  getNewsletters,
} from "~/server/newsletters";

export const newslettersQuery = (q: string) =>
  queryOptions({
    queryKey: ["newsletters", "list", q],
    queryFn: () => getNewsletters({ data: { q } }),
    placeholderData: (previous) => previous,
  });

export const managedNewslettersQuery = (query: ManageNewslettersQuery) =>
  queryOptions({
    queryKey: ["newsletters", "manage", query],
    queryFn: () => getManagedNewsletters({ data: query }),
    placeholderData: (previous) => previous,
  });

export const newsletterOptionsQuery = queryOptions({
  queryKey: ["newsletters", "options"],
  queryFn: () => getNewsletterOptions(),
});

export const newsletterEditorQuery = (id: string) =>
  queryOptions({
    queryKey: ["newsletters", "editor", id],
    queryFn: () => getNewsletterEditor({ data: { id } }),
  });

export const newsletterQuery = (id: string) =>
  queryOptions({
    queryKey: ["newsletters", "record", id],
    queryFn: () => getNewsletter({ data: { id } }),
  });
