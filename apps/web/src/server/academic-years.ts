import {
  academicYearQuerySchema,
  saveAcademicYearSchema,
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
