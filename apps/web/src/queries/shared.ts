import { queryOptions } from "@tanstack/react-query";

import { readShared, readSharedSection } from "~/server/shared";

/** A shared block as documents show it, asked for again when it changes. */
export const sharedBlockQuery = (id: string) =>
  queryOptions({
    queryKey: ["shared", "block", id],
    queryFn: () => readShared({ data: { id } }),
    staleTime: 30_000,
    retry: false,
  });

/** A shared section in both its languages, as the website builder draws it. */
export const sharedSectionQuery = (id: string) =>
  queryOptions({
    queryKey: ["shared", "section", id],
    queryFn: () => readSharedSection({ data: { id } }),
    staleTime: 30_000,
  });
