import { queryOptions } from "@tanstack/react-query";

import { getClassTimetable } from "~/server/timetable";

export const classTimetableQuery = (classId: string) =>
  queryOptions({
    queryKey: ["classes", "timetable", classId],
    queryFn: () => getClassTimetable({ data: { classId } }),
  });
