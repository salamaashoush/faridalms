import type { SearchQuery } from "@faridalms/domain/search";

import { queryOptions } from "@tanstack/react-query";

import { search } from "~/server/search";

export const searchQuery = (query: SearchQuery) =>
  queryOptions({
    queryKey: ["search", query.q, query.kind, query.page],
    queryFn: () => search({ data: query }),
    placeholderData: (previous) => previous,
  });
