import type { SearchKind } from "@faridalms/domain/search";

import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { search } from "~/server/search";

/** The first few hits of every kind, for the search palette and the All tab. */
export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ["search", q, "all"],
    queryFn: () => search({ data: { q, kind: "all" } }),
    placeholderData: (previous) => previous,
  });

/** One kind's hits, a page at a time. */
export const searchKindQuery = (q: string, kind: SearchKind) =>
  infiniteQueryOptions({
    queryKey: ["search", q, kind],
    queryFn: ({ pageParam }) =>
      search({ data: { q, kind, after: pageParam || undefined } }),
    initialPageParam: "",
    getNextPageParam: (last) => last.next ?? undefined,
  });
