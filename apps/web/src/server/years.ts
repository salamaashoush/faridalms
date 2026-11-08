import { paintDaysSchema, targetDaysSchema } from "@faridalms/domain/calendar";
import { historyQuerySchema } from "@faridalms/domain/history";
import {
  periodsQuerySchema,
  removeBellScheduleSchema,
  runDayAsSchema,
  saveBellScheduleSchema,
  savePeriodsSchema,
  scheduleDaysSchema,
} from "@faridalms/domain/timetable";
import { saveYearSchema, yearLifecycleSchema } from "@faridalms/domain/years";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

export const getYears = createServerFn({ method: "GET" }).handler(() =>
  record(backend().years.directory()),
);

export const getYear = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().years.record(data)));

export const getYearHistory = createServerFn({ method: "GET" })
  .validator(checked(historyQuerySchema))
  .handler(({ data }) => record(backend().years.history(data)));

export const saveYear = createServerFn({ method: "POST" })
  .validator(checked(saveYearSchema))
  .handler(({ data }) => backend().years.save(data));

export const changeYearLifecycle = createServerFn({ method: "POST" })
  .validator(checked(yearLifecycleSchema))
  .handler(({ data }) => backend().years.lifecycle(data));

export const getYearDays = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().years.days(data)));

export const paintYearDays = createServerFn({ method: "POST" })
  .validator(checked(paintDaysSchema))
  .handler(({ data }) => backend().years.paint(data));

export const setYearTarget = createServerFn({ method: "POST" })
  .validator(checked(targetDaysSchema))
  .handler(({ data }) => backend().years.target(data));

export const getYearPeriods = createServerFn({ method: "GET" })
  .validator(checked(periodsQuerySchema))
  .handler(({ data }) => record(backend().years.periods(data)));

export const saveYearPeriods = createServerFn({ method: "POST" })
  .validator(checked(savePeriodsSchema))
  .handler(({ data }) => backend().years.savePeriods(data));

export const saveBellSchedule = createServerFn({ method: "POST" })
  .validator(checked(saveBellScheduleSchema))
  .handler(({ data }) => backend().years.saveSchedule(data));

export const removeBellSchedule = createServerFn({ method: "POST" })
  .validator(checked(removeBellScheduleSchema))
  .handler(({ data }) => backend().years.removeSchedule(data));

export const scheduleYearDays = createServerFn({ method: "POST" })
  .validator(checked(scheduleDaysSchema))
  .handler(({ data }) => backend().years.scheduleRange(data));

export const runYearDayAs = createServerFn({ method: "POST" })
  .validator(checked(runDayAsSchema))
  .handler(({ data }) => backend().years.runDay(data));
