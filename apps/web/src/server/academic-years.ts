import {
  academicYearQuerySchema,
  saveAcademicYearSchema,
  setDefaultYearSchema,
  setYearStatusSchema,
} from "@faridalms/domain/academic-year";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";

export const getAcademicYears = createServerFn({ method: "GET" }).handler(() =>
  backend().getAcademicYears(),
);
export const getAcademicYear = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(academicYearQuerySchema, input))
  .handler(({ data }) => backend().getAcademicYear(data));
export const saveAcademicYear = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(saveAcademicYearSchema, input))
  .handler(({ data }) => backend().saveAcademicYear(data));
export const setAcademicYearStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(setYearStatusSchema, input))
  .handler(({ data }) => backend().setAcademicYearStatus(data));
export const setDefaultAcademicYear = createServerFn({ method: "POST" })
  .validator((input: unknown) => v.parse(setDefaultYearSchema, input))
  .handler(({ data }) => backend().setDefaultAcademicYear(data));
export const getAcademicYearEvents = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(academicYearQuerySchema, input))
  .handler(({ data }) => backend().getAcademicYearEvents(data));
