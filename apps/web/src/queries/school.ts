import type { ManagementOptionsInput } from "@faridalms/domain/administration-schema";
import type { StudentScopedQuery } from "@faridalms/domain/school-schema";

import { queryOptions } from "@tanstack/react-query";

import {
  getManagementOptions,
  getStudent,
  getVisibleStudents,
} from "~/server/school";

export const visibleStudentsQuery = queryOptions({
  queryKey: ["students", "visible"],
  queryFn: () => getVisibleStudents(),
});

export function studentQuery(query: StudentScopedQuery) {
  return queryOptions({
    queryKey: ["students", "detail", query],
    queryFn: () => getStudent({ data: query }),
    placeholderData: (previous) => previous,
  });
}

export function managementOptionsQuery(query: ManagementOptionsInput) {
  return queryOptions({
    queryKey: ["management-options", query],
    queryFn: () => getManagementOptions({ data: query }),
  });
}
