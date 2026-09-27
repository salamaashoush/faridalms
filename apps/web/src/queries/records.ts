import { queryOptions } from "@tanstack/react-query";

import { getCustody, getDemographics, getHealth } from "~/server/records";

export const healthQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["people", "student", studentId, "health"],
    queryFn: () => getHealth({ data: { studentId } }),
  });

export const demographicsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["people", "student", userId, "demographics"],
    queryFn: () => getDemographics({ data: { userId } }),
  });

export const custodyQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["people", "student", studentId, "custody"],
    queryFn: () => getCustody({ data: { studentId } }),
  });
