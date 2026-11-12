import {
  periodsQuerySchema,
  removeBellScheduleSchema,
  saveBellScheduleSchema,
  savePeriodsSchema,
} from "@faridalms/domain/timetable";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getYearPeriods = createServerFn({ method: "GET" })
  .validator(checked(periodsQuerySchema))
  .handler(({ data }) => record(backend().periods.periods(data)));

export const saveYearPeriods = createServerFn({ method: "POST" })
  .validator(checked(savePeriodsSchema))
  .handler(({ data }) => backend().periods.savePeriods(data));

export const saveBellSchedule = createServerFn({ method: "POST" })
  .validator(checked(saveBellScheduleSchema))
  .handler(({ data }) => backend().periods.saveSchedule(data));

export const removeBellSchedule = createServerFn({ method: "POST" })
  .validator(checked(removeBellScheduleSchema))
  .handler(({ data }) => backend().periods.removeSchedule(data));
