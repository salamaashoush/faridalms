import type { ManagementOptionsInput } from "@faridalms/domain/administration-schema";
import type {
  RecipientCursor,
  CalendarQuery,
  MessagesQuery,
  NewslettersQuery,
  StudentScopedQuery,
} from "@faridalms/domain/school-schema";

import { queryOptions } from "@tanstack/react-query";

import {
  getAdminOverview,
  getCalendar,
  getFamilyOverview,
  getManagementOptions,
  getMessage,
  getMessages,
  getNewsletters,
  getRecipients,
  getStudent,
  getStudentOverview,
  getTeachingOverview,
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

export const familyOverviewQuery = queryOptions({
  queryKey: ["overview", "family"],
  queryFn: () => getFamilyOverview(),
});

export const studentOverviewQuery = queryOptions({
  queryKey: ["overview", "student"],
  queryFn: () => getStudentOverview(),
});

export const teachingOverviewQuery = queryOptions({
  queryKey: ["overview", "teaching"],
  queryFn: () => getTeachingOverview(),
});

export const adminOverviewQuery = queryOptions({
  queryKey: ["overview", "admin"],
  queryFn: () => getAdminOverview(),
});

export function managementOptionsQuery(query: ManagementOptionsInput) {
  return queryOptions({
    queryKey: ["management-options", query],
    queryFn: () => getManagementOptions({ data: query }),
  });
}

export function messagesQuery(query: MessagesQuery) {
  return queryOptions({
    queryKey: ["messages", query],
    queryFn: () => getMessages({ data: query }),
    placeholderData: (previous) => previous,
  });
}

export function messageQuery(id: string) {
  return queryOptions({
    queryKey: ["messages", "detail", id],
    queryFn: () => getMessage({ data: { id } }),
  });
}

export function recipientsQuery(
  category: "teachers" | "administration" | "parents" | "students",
  q = "",
  cursor?: RecipientCursor,
) {
  return queryOptions({
    queryKey: ["messages", "recipients", category, q, cursor],
    queryFn: () => getRecipients({ data: { category, q, cursor } }),
  });
}

export function newslettersQuery(query: NewslettersQuery) {
  return queryOptions({
    queryKey: ["newsletters", query],
    queryFn: () => getNewsletters({ data: query }),
    placeholderData: (previous) => previous,
  });
}

export function calendarQuery(query: CalendarQuery) {
  return queryOptions({
    queryKey: ["calendar", query],
    queryFn: () => getCalendar({ data: query }),
    placeholderData: (previous) => previous,
  });
}
