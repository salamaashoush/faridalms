import { queryOptions } from "@tanstack/react-query";

import { readShared } from "~/server/shared";

/** A shared block as documents show it, asked for again when it changes. */
export const sharedBlockQuery = (id: string) =>
  queryOptions({
    queryKey: ["shared", "block", id],
    queryFn: () => readShared({ data: { id } }),
    staleTime: 30_000,
    retry: false,
  });
