import {
  classGoalsSchema,
  classProgressSchema,
  curriculumMapSchema,
  describeStandardsSchema,
  goalsReportSchema,
  goalsReturnSchema,
  importCaseSchema,
  judgeGoalSchema,
  moveStandardSchema,
  observeSchema,
  refSchema,
  saveFrameworkSchema,
  saveStandardSchema,
  searchStandardsSchema,
  shareGoalsReportSchema,
  sittingsSchema,
  studentProgressSchema,
} from "@faridalms/domain/standards";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getFrameworks = createServerFn({ method: "GET" }).handler(() =>
  record(backend().standards.frameworks()),
);

export const getFramework = createServerFn({ method: "GET" })
  .validator(checked(refSchema))
  .handler(({ data }) => record(backend().standards.framework(data)));

export const saveFramework = createServerFn({ method: "POST" })
  .validator(checked(saveFrameworkSchema))
  .handler(({ data }) => backend().standards.saveFramework(data));

export const removeFramework = createServerFn({ method: "POST" })
  .validator(checked(refSchema))
  .handler(({ data }) => backend().standards.removeFramework(data));

export const saveStandard = createServerFn({ method: "POST" })
  .validator(checked(saveStandardSchema))
  .handler(({ data }) => backend().standards.saveStandard(data));

export const moveStandard = createServerFn({ method: "POST" })
  .validator(checked(moveStandardSchema))
  .handler(({ data }) => backend().standards.move(data));

export const removeStandard = createServerFn({ method: "POST" })
  .validator(checked(refSchema))
  .handler(({ data }) => backend().standards.remove(data));

export const addIbConcepts = createServerFn({ method: "POST" }).handler(() =>
  backend().standards.addIbConcepts(),
);

export const getCurriculumMap = createServerFn({ method: "GET" })
  .validator(checked(curriculumMapSchema))
  .handler(({ data }) => backend().standards.curriculumMap(data));

export const importCase = createServerFn({ method: "POST" })
  .validator(checked(importCaseSchema))
  .handler(({ data }) => backend().standards.importCase(data));

export const searchStandards = createServerFn({ method: "GET" })
  .validator(checked(searchStandardsSchema))
  .handler(({ data }) => backend().standards.search(data));

export const describeStandards = createServerFn({ method: "POST" })
  .validator(checked(describeStandardsSchema))
  .handler(({ data }) => backend().standards.describe(data));

export const getClassProgress = createServerFn({ method: "GET" })
  .validator(checked(classProgressSchema))
  .handler(({ data }) => record(backend().standards.classProgress(data)));

export const getStudentProgress = createServerFn({ method: "GET" })
  .validator(checked(studentProgressSchema))
  .handler(({ data }) => record(backend().standards.studentProgress(data)));

export const getStandardSittings = createServerFn({ method: "GET" })
  .validator(checked(sittingsSchema))
  .handler(({ data }) => backend().standards.sittings(data));

export const observeStandard = createServerFn({ method: "POST" })
  .validator(checked(observeSchema))
  .handler(({ data }) => backend().standards.observe(data));

export const removeObservation = createServerFn({ method: "POST" })
  .validator(checked(refSchema))
  .handler(({ data }) => backend().standards.removeObservation(data));

export const getClassGoals = createServerFn({ method: "GET" })
  .validator(checked(classGoalsSchema))
  .handler(({ data }) => record(backend().standards.classGoals(data)));

export const judgeGoal = createServerFn({ method: "POST" })
  .validator(checked(judgeGoalSchema))
  .handler(({ data }) => backend().standards.judgeGoal(data));

export const addEarlyGoals = createServerFn({ method: "POST" }).handler(() =>
  backend().standards.addEarlyGoals(),
);

export const addDevelopmentMatters = createServerFn({
  method: "POST",
}).handler(() => backend().standards.addDevelopmentMatters());

export const shareGoalsReport = createServerFn({ method: "POST" })
  .validator(checked(shareGoalsReportSchema))
  .handler(({ data }) => backend().standards.shareGoalsReport(data));

export const getGoalsReport = createServerFn({ method: "GET" })
  .validator(checked(goalsReportSchema))
  .handler(({ data }) => record(backend().standards.goalsReport(data)));

export const makeGoalsReturn = createServerFn({ method: "POST" })
  .validator(checked(goalsReturnSchema))
  .handler(({ data }) => backend().standards.goalsReturn(data));
