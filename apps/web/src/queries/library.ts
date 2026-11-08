import type { TemplateKind } from "@faridalms/domain/templates";

import { queryOptions } from "@tanstack/react-query";

import {
  getLibrary,
  getLibraryQueue,
  openSectionTemplate,
  openTemplate,
} from "~/server/templates";

export const libraryQuery = (input: {
  kind: TemplateKind | "";
  subjectId: string;
  q: string;
}) =>
  queryOptions({
    queryKey: ["templates", "library", input],
    queryFn: () => getLibrary({ data: input }),
    placeholderData: (previous) => previous,
  });

export const libraryQueueQuery = queryOptions({
  queryKey: ["templates", "queue"],
  queryFn: () => getLibraryQueue(),
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
