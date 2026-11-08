import type {
  InDocumentsQuery,
  LibraryQuery,
} from "@faridalms/domain/media-library";

import { queryOptions } from "@tanstack/react-query";

import {
  libraryInDocuments,
  libraryStorage,
  libraryUses,
  libraryVersions,
  listLibrary,
} from "~/server/media-library";

export const libraryQuery = (view: LibraryQuery) =>
  queryOptions({
    queryKey: ["media-library", "list", view],
    queryFn: () => listLibrary({ data: view }),
    placeholderData: (previous) => previous,
  });

export const libraryUsesQuery = (id: string) =>
  queryOptions({
    queryKey: ["media-library", "uses", id],
    queryFn: () => libraryUses({ data: { id } }),
  });

export const libraryInDocumentsQuery = (view: InDocumentsQuery) =>
  queryOptions({
    queryKey: ["media-library", "in-documents", view],
    queryFn: () => libraryInDocuments({ data: view }),
    placeholderData: (previous) => previous,
  });

export const libraryStorageQuery = queryOptions({
  queryKey: ["media-library", "storage"],
  queryFn: () => libraryStorage(),
});

export const libraryVersionsQuery = (id: string) =>
  queryOptions({
    queryKey: ["media-library", "versions", id],
    queryFn: () => libraryVersions({ data: { id } }),
  });
