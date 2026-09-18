import {
  saveTimetableSchema,
  timetableQuerySchema,
} from "@faridalms/domain/timetable";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";

export const getClassTimetable = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(timetableQuerySchema, input))
  .handler(({ data }) => backend().getClassTimetable(data));
export const saveTimetable = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(saveTimetableSchema, input))
  .handler(({ data }) => backend().saveTimetable(data));
