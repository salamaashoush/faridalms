import { queryOptions } from "@tanstack/react-query";

import {
  getAcademicYear,
  getAcademicYearEvents,
  getAcademicYears,
} from "~/server/academic-years";

export const academicYearsQuery = queryOptions({
  queryKey: ["academic-years"],
  queryFn: () => getAcademicYears(),
});
export const academicYearQuery = (id: string) =>
  queryOptions({
    queryKey: ["academic-years", id],
    queryFn: () => getAcademicYear({ data: { id } }),
  });
export const academicYearEventsQuery = (id: string) =>
  queryOptions({
    queryKey: ["academic-years", id, "events"],
    queryFn: () => getAcademicYearEvents({ data: { id } }),
  });
