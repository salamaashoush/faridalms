import type { TemplateKind } from "@faridalms/domain/templates";

import { queryOptions } from "@tanstack/react-query";

import {
  browseTemplates,
  getTemplateQueue,
  openSectionTemplate,
  openTemplate,
} from "~/server/templates";

export const templatesQuery = (input: {
  kind: TemplateKind | "";
  subjectId: string;
  q: string;
}) =>
  queryOptions({
    queryKey: ["templates", "browse", input],
    queryFn: () => browseTemplates({ data: input }),
    placeholderData: (previous) => previous,
  });

export const templateQueueQuery = queryOptions({
  queryKey: ["templates", "queue"],
  queryFn: () => getTemplateQueue(),
});

export const templateQuery = (id: string) =>
  queryOptions({
    queryKey: ["templates", "open", id],
    queryFn: () => openTemplate({ data: { id } }),
  });

export const sectionTemplateQuery = (id: string) =>
  queryOptions({
    queryKey: ["templates", "section", id],
    queryFn: () => openSectionTemplate({ data: { id } }),
  });
