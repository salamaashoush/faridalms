import { queryOptions } from "@tanstack/react-query";

import {
  getArrangements,
  getCustody,
  getDemographics,
  getHealth,
  getIdentifiers,
} from "~/server/records";

export const healthQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["people", "student", studentId, "health"],
    queryFn: () => getHealth({ data: { studentId } }),
  });

export const arrangementsQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["people", "student", studentId, "arrangements"],
    queryFn: () => getArrangements({ data: { studentId } }),
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

export const identifiersQuery = (studentId: string) =>
  queryOptions({
    queryKey: ["people", "student", studentId, "identifiers"],
    queryFn: () => getIdentifiers({ data: { studentId } }),
  });
