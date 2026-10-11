import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";
import { checked } from "./input";

export const getTeacherHome = createServerFn({ method: "GET" }).handler(() =>
  backend().home.teacher(),
);

export const getFamilyHome = createServerFn({ method: "GET" })
  .validator(
    checked(
      v.object({
        studentId: v.optional(
          v.union([v.literal(""), v.pipe(v.string(), v.uuid())]),
          "",
        ),
      }),
    ),
  )
  .handler(({ data }) => backend().home.family(data));

export const getChildDetails = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => backend().home.child(data));

export const getStudentHome = createServerFn({ method: "GET" }).handler(() =>
  backend().home.student(),
);

export const getAdminHome = createServerFn({ method: "GET" }).handler(() =>
  backend().home.admin(),
);
