import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";
import { checked } from "./input";

export const getTeacherHome = createServerFn({ method: "GET" }).handler(() =>
  backend().home.teacher(),
);

export const getFollowedHome = createServerFn({ method: "GET" })
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
  .handler(({ data }) => backend().home.followed(data));

export const getLearnerDetails = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => backend().home.details(data));

export const getStudentHome = createServerFn({ method: "GET" }).handler(() =>
  backend().home.student(),
);

export const getAdminHome = createServerFn({ method: "GET" }).handler(() =>
  backend().home.admin(),
);

export const hideOnboarding = createServerFn({ method: "POST" }).handler(() =>
  backend().home.hideOnboarding(),
);
