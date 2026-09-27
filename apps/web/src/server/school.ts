import { managementOptionsSchema } from "@faridalms/domain/administration-schema";
import { studentScopedQuerySchema } from "@faridalms/domain/school-schema";
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

export const getManagementOptions = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(managementOptionsSchema, input))
  .handler(({ data }) => backend().getManagementOptions(data));
