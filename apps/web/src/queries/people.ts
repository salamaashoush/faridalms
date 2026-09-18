import { queryOptions } from "@tanstack/react-query";

import { getPerson } from "~/server/people";

export const personQuery = (id: string) =>
  queryOptions({
    queryKey: ["people", id],
    queryFn: () => getPerson({ data: { id } }),
  });
