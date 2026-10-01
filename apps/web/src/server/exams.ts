import {
  addOfficialSessionSchema,
  examHistorySchema,
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
