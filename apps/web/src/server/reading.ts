import { resetNormsSchema, saveNormsSchema } from "@faridalms/domain/reading";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getReadingNorms = createServerFn({ method: "GET" }).handler(() =>
  record(backend().reading.norms()),
);

export const saveReadingNorms = createServerFn({ method: "POST" })
  .validator(
    checked(
      v.object({
        ...saveNormsSchema.entries,
        expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
      }),
    ),
  )
  .handler(({ data }) => backend().reading.saveNorms(data));

export const resetReadingNorms = createServerFn({ method: "POST" })
  .validator(checked(resetNormsSchema))
  .handler(({ data }) => backend().reading.resetNorms(data));

export const getStudentReading = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => record(backend().reading.student(data)));

export const getMyReading = createServerFn({ method: "GET" }).handler(() =>
  record(backend().reading.mine()),
);
