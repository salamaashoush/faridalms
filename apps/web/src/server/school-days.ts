import {
  paintDaysSchema,
  schoolDaysQuerySchema,
} from "@faridalms/domain/school-days";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getSchoolDays = createServerFn({ method: "GET" })
  .validator(checked(schoolDaysQuerySchema))
  .handler(({ data }) => record(backend().schoolDays.days(data)));

export const paintSchoolDays = createServerFn({ method: "POST" })
  .validator(checked(paintDaysSchema))
  .handler(({ data }) => backend().schoolDays.paint(data));
