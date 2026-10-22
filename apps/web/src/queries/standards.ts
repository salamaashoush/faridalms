import { queryOptions } from "@tanstack/react-query";

import { getFramework, getFrameworks } from "~/server/standards";

export const frameworksQuery = queryOptions({
  queryKey: ["standards", "frameworks"],
  queryFn: () => getFrameworks(),
});

export const frameworkQuery = (id: string) =>
  queryOptions({
    queryKey: ["standards", "framework", id],
    queryFn: () => getFramework({ data: { id } }),
  });
