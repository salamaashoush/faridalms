import { paintDaysSchema } from "@faridalms/domain/calendar";
import {
  runDayAsSchema,
  scheduleDaysSchema,
} from "@faridalms/domain/timetable";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

export const getYearDays = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().schoolDays.days(data)));

export const paintYearDays = createServerFn({ method: "POST" })
  .validator(checked(paintDaysSchema))
  .handler(({ data }) => backend().schoolDays.paint(data));

export const scheduleYearDays = createServerFn({ method: "POST" })
  .validator(checked(scheduleDaysSchema))
  .handler(({ data }) => backend().schoolDays.scheduleRange(data));

export const runYearDayAs = createServerFn({ method: "POST" })
  .validator(checked(runDayAsSchema))
  .handler(({ data }) => backend().schoolDays.runDay(data));
