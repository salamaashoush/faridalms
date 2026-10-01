import {
  addOfficialSessionSchema,
  assignmentRefSchema,
  authenticateSchema,
  declareSchema,
  examHistorySchema,
  paperDeclarationSchema,
  setCourseworkSchema,
  retireSessionSchema,
  saveBoardSchema,
  saveSessionSchema,
} from "@faridalms/domain/exams";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";
import { checked } from "./input";

export const getExamOverview = createServerFn({ method: "GET" }).handler(() =>
  backend().exams.overview(),
);

export const saveExamBoard = createServerFn({ method: "POST" })
  .validator(checked(saveBoardSchema))
  .handler(({ data }) => backend().exams.saveBoard(data));

export const addOfficialSession = createServerFn({ method: "POST" })
  .validator(checked(addOfficialSessionSchema))
  .handler(({ data }) => backend().exams.addOfficial(data));

export const saveExamSession = createServerFn({ method: "POST" })
  .validator(checked(saveSessionSchema))
  .handler(({ data }) => backend().exams.saveSession(data));

export const retireExamSession = createServerFn({ method: "POST" })
  .validator(checked(retireSessionSchema))
  .handler(({ data }) => backend().exams.retireSession(data));

export const getExamHistory = createServerFn({ method: "GET" })
  .validator(checked(examHistorySchema))
  .handler(({ data }) => backend().exams.history(data));

export const getCoursework = createServerFn({ method: "GET" })
  .validator(checked(assignmentRefSchema))
  .handler(({ data }) => backend().exams.coursework(data));

export const setCoursework = createServerFn({ method: "POST" })
  .validator(checked(setCourseworkSchema))
  .handler(({ data }) => backend().exams.setCoursework(data));

export const getWorkStanding = createServerFn({ method: "GET" })
  .validator(checked(assignmentRefSchema))
  .handler(({ data }) => backend().exams.workStanding(data));

export const getMyStanding = createServerFn({ method: "GET" })
  .validator(checked(assignmentRefSchema))
  .handler(({ data }) => backend().exams.myStanding(data));

export const declareWork = createServerFn({ method: "POST" })
  .validator(checked(declareSchema))
  .handler(({ data }) => backend().exams.declare(data));

export const recordPaperDeclaration = createServerFn({ method: "POST" })
  .validator(checked(paperDeclarationSchema))
  .handler(({ data }) => backend().exams.recordPaperDeclaration(data));

export const authenticateWork = createServerFn({ method: "POST" })
  .validator(checked(authenticateSchema))
  .handler(({ data }) => backend().exams.authenticate(data));

export const getCourseworkList = createServerFn({ method: "GET" }).handler(() =>
  backend().exams.courseworkList(),
);

export const getCourseworkStudents = createServerFn({ method: "GET" })
  .validator(checked(assignmentRefSchema))
  .handler(({ data }) => backend().exams.courseworkStudents(data));
