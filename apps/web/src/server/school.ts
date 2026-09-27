import {
  publishNewsletterSchema,
  managementOptionsSchema,
} from "@faridalms/domain/administration-schema";
import {
  calendarEventSchema,
  calendarQuerySchema,
  newslettersQuerySchema,
  studentScopedQuerySchema,
} from "@faridalms/domain/school-schema";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";

export const getVisibleStudents = createServerFn({ method: "GET" }).handler(
  () => backend().getVisibleStudents(),
);

export const getStudent = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(studentScopedQuerySchema, input))
  .handler(({ data }) => record(backend().getStudent(data)));

export const getFamilyOverview = createServerFn({ method: "GET" }).handler(() =>
  backend().getFamilyOverview(),
);

export const getStudentOverview = createServerFn({ method: "GET" }).handler(
  () => backend().getStudentOverview(),
);

export const getTeachingOverview = createServerFn({ method: "GET" }).handler(
  () => backend().getTeachingOverview(),
);

export const getAdminOverview = createServerFn({ method: "GET" }).handler(() =>
  backend().getAdminOverview(),
);

export const getNewsletters = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(newslettersQuerySchema, input))
  .handler(({ data }) => backend().getNewsletters(data));

export const getCalendar = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(calendarQuerySchema, input))
  .handler(({ data }) => backend().getCalendar(data));

export const saveCalendarEvent = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(calendarEventSchema, input))
  .handler(({ data }) => backend().saveCalendarEvent(data));

export const getManagementOptions = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(managementOptionsSchema, input))
  .handler(({ data }) => backend().getManagementOptions(data));

export const publishNewsletter = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(publishNewsletterSchema, input))
  .handler(({ data }) => backend().publishNewsletter(data));
