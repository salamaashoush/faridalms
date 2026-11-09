import type { InDocumentsQuery, MediaQuery } from "@faridalms/domain/media";

import { queryOptions } from "@tanstack/react-query";

import {
  mediaInDocuments,
  mediaStorage,
  mediaUses,
  mediaVersions,
  listMedia,
} from "~/server/media";

export const mediaQuery = (view: MediaQuery) =>
  queryOptions({
    queryKey: ["media", "list", view],
    queryFn: () => listMedia({ data: view }),
    placeholderData: (previous) => previous,
  });

export const mediaUsesQuery = (id: string) =>
  queryOptions({
    queryKey: ["media", "uses", id],
    queryFn: () => mediaUses({ data: { id } }),
  });

export const mediaInDocumentsQuery = (view: InDocumentsQuery) =>
  queryOptions({
    queryKey: ["media", "in-documents", view],
    queryFn: () => mediaInDocuments({ data: view }),
    placeholderData: (previous) => previous,
  });

export const mediaStorageQuery = queryOptions({
  queryKey: ["media", "storage"],
  queryFn: () => mediaStorage(),
});

export const mediaVersionsQuery = (id: string) =>
  queryOptions({
    queryKey: ["media", "versions", id],
    queryFn: () => mediaVersions({ data: { id } }),
  });
