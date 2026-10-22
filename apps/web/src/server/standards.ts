import {
  classProgressSchema,
  describeStandardsSchema,
  importCaseSchema,
  moveStandardSchema,
  refSchema,
  saveFrameworkSchema,
  saveStandardSchema,
  searchStandardsSchema,
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
