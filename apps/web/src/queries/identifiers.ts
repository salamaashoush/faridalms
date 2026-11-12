import { queryOptions } from "@tanstack/react-query";

import { getIdentifiers } from "~/server/identifiers";

export const identifiersQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["people", "student", studentId, "identifiers"],
    queryFn: () => getIdentifiers({ data: { studentId } }),
  });
