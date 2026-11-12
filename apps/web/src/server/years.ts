import { historyQuerySchema } from "@faridalms/domain/history";
import { schoolDaysQuerySchema } from "@faridalms/domain/school-days";
import {
  saveArrivalSchema,
  saveYearSchema,
  targetDaysSchema,
  yearLifecycleSchema,
} from "@faridalms/domain/years";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

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

export const getYearsInSpan = createServerFn({ method: "GET" })
  .validator(checked(schoolDaysQuerySchema))
  .handler(({ data }) => record(backend().years.planner(data)));

export const setYearTarget = createServerFn({ method: "POST" })
  .validator(checked(targetDaysSchema))
  .handler(({ data }) => backend().years.target(data));

export const getYearOptions = createServerFn({ method: "GET" }).handler(() =>
  record(backend().years.options()),
);

const uuid = v.pipe(v.string(), v.uuid());

export const getClassYear = createServerFn({ method: "GET" })
  .validator(checked(v.object({ classId: uuid })))
  .handler(({ data }) => record(backend().years.ofClass(data)));

export const getStudentClassYears = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: uuid })))
  .handler(({ data }) => record(backend().years.ofStudentClasses(data)));

export const getPlacements = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: uuid })))
  .handler(({ data }) => record(backend().years.placementsOf(data)));

export const saveArrival = createServerFn({ method: "POST" })
  .validator(checked(saveArrivalSchema))
  .handler(({ data }) => backend().years.saveArrival(data));

export const getYearEnd = createServerFn({ method: "GET" }).handler(() =>
  record(backend().years.yearEnd()),
);
