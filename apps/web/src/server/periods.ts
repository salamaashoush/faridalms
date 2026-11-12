import {
  periodsQuerySchema,
  removeBellScheduleSchema,
  runDayAsSchema,
  saveBellScheduleSchema,
  savePeriodsSchema,
  scheduleDaysSchema,
  timetableDaysSchema,
} from "@faridalms/domain/timetable";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getSchoolPeriods = createServerFn({ method: "GET" })
  .validator(checked(periodsQuerySchema))
  .handler(({ data }) => record(backend().periods.periods(data)));

export const saveSchoolPeriods = createServerFn({ method: "POST" })
  .validator(checked(savePeriodsSchema))
  .handler(({ data }) => backend().periods.savePeriods(data));

export const saveBellSchedule = createServerFn({ method: "POST" })
  .validator(checked(saveBellScheduleSchema))
  .handler(({ data }) => backend().periods.saveSchedule(data));

export const removeBellSchedule = createServerFn({ method: "POST" })
  .validator(checked(removeBellScheduleSchema))
  .handler(({ data }) => backend().periods.removeSchedule(data));

export const getTimetableDays = createServerFn({ method: "GET" })
  .validator(checked(timetableDaysSchema))
  .handler(({ data }) => record(backend().periods.days(data)));

export const scheduleDays = createServerFn({ method: "POST" })
  .validator(checked(scheduleDaysSchema))
  .handler(({ data }) => backend().periods.scheduleRange(data));

export const runDayAs = createServerFn({ method: "POST" })
  .validator(checked(runDayAsSchema))
  .handler(({ data }) => backend().periods.runDay(data));
