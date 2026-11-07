import type { LibraryQuery } from "@faridalms/domain/media-library";

import { queryOptions } from "@tanstack/react-query";

import { libraryUses, listLibrary } from "~/server/media-library";

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
