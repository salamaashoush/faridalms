import {
  removeHealthRecordSchema,
  saveCustodySchema,
  saveDemographicsSchema,
  saveHealthRecordSchema,
} from "@faridalms/domain/people";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { checked } from "./input";

const student = v.object({ studentId: v.pipe(v.string(), v.uuid()) });

export const getHealth = createServerFn({ method: "GET" })
  .validator(checked(student))
  .handler(({ data }) => record(backend().records.health(data)));

export const saveHealth = createServerFn({ method: "POST" })
  .validator(checked(saveHealthRecordSchema))
  .handler(({ data }) => backend().records.saveHealth(data));

export const removeHealth = createServerFn({ method: "POST" })
  .validator(checked(removeHealthRecordSchema))
  .handler(({ data }) => backend().records.removeHealth(data));

export const getDemographics = createServerFn({ method: "GET" })
  .validator(checked(v.object({ userId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => record(backend().records.demographics(data)));

export const saveDemographics = createServerFn({ method: "POST" })
  .validator(checked(saveDemographicsSchema))
  .handler(({ data }) => backend().records.saveDemographics(data));

export const getCustody = createServerFn({ method: "GET" })
  .validator(checked(student))
  .handler(({ data }) => record(backend().records.custody(data)));

export const saveCustody = createServerFn({ method: "POST" })
  .validator(checked(saveCustodySchema))
  .handler(({ data }) => backend().records.saveCustody(data));
