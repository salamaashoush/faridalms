import { queryOptions } from "@tanstack/react-query";

import {
  getNewsletterEditorContext,
  getNewsletterDraft,
  getNewsletterDrafts,
} from "~/server/newsletter-drafts";

export const newsletterDraftQuery = (id: string) =>
  queryOptions({
    queryKey: ["newsletter-drafts", "detail", id],
    queryFn: () => getNewsletterDraft({ data: { id } }),
  });
export const newsletterDraftsQuery = (schoolYearId: string, page: number) =>
  queryOptions({
    queryKey: ["newsletter-drafts", "list", schoolYearId, page],
    queryFn: () => getNewsletterDrafts({ data: { schoolYearId, page } }),
  });

export const newsletterEditorContextQuery = queryOptions({
  queryKey: ["newsletter-editor-context"],
  queryFn: () => getNewsletterEditorContext(),
});
