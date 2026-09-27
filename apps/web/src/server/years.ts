import { paintDaysSchema, targetDaysSchema } from "@faridalms/domain/calendar";
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
  .validator(byId)
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
