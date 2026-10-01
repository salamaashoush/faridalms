import {
  classGradingSchema,
  retireProgrammeSchema,
  retireScaleSchema,
  saveBandsSchema,
  saveProgrammeSchema,
  saveScaleSchema,
} from "@faridalms/domain/grading";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";
import { checked } from "./input";

const classRef = v.object({ classId: v.pipe(v.string(), v.uuid()) });
const regrade = v.object({
  periodId: v.pipe(v.string(), v.uuid()),
  reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
});

export const getGradingOverview = createServerFn({ method: "GET" }).handler(
  () => backend().grading.overview(),
);

export const saveGradeScale = createServerFn({ method: "POST" })
  .validator(checked(saveScaleSchema))
  .handler(({ data }) => backend().grading.saveScale(data));

export const saveGradeBands = createServerFn({ method: "POST" })
  .validator(checked(saveBandsSchema))
  .handler(({ data }) => backend().grading.saveBands(data));

export const retireGradeScale = createServerFn({ method: "POST" })
  .validator(checked(retireScaleSchema))
  .handler(({ data }) => backend().grading.retireScale(data));

export const saveProgramme = createServerFn({ method: "POST" })
  .validator(checked(saveProgrammeSchema))
  .handler(({ data }) => backend().grading.saveProgramme(data));

export const retireProgramme = createServerFn({ method: "POST" })
  .validator(checked(retireProgrammeSchema))
  .handler(({ data }) => backend().grading.retireProgramme(data));

export const getClassGrading = createServerFn({ method: "GET" })
  .validator(checked(classRef))
  .handler(({ data }) => backend().grading.classGrading(data));

export const setClassGrading = createServerFn({ method: "POST" })
  .validator(checked(classGradingSchema))
  .handler(({ data }) => backend().grading.setClassGrade(data));

export const getClassPlan = createServerFn({ method: "GET" })
  .validator(checked(classRef))
  .handler(({ data }) => backend().grading.classPlan(data));

export const regradeTerm = createServerFn({ method: "POST" })
  .validator(checked(regrade))
  .handler(({ data }) => backend().grading.regradeTerm(data));
