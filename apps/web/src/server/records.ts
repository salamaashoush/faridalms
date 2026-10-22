import {
  arrangementsRefSchema,
  saveArrangementsSchema,
} from "@faridalms/domain/arrangements";
import {
  identifierRefSchema,
  saveIdentifierSchema,
} from "@faridalms/domain/identifiers";
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

export const getArrangements = createServerFn({ method: "GET" })
  .validator(checked(arrangementsRefSchema))
  .handler(({ data }) => record(backend().records.arrangements(data)));

export const saveArrangements = createServerFn({ method: "POST" })
  .validator(checked(saveArrangementsSchema))
  .handler(({ data }) => backend().records.saveArrangements(data));

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

export const getIdentifiers = createServerFn({ method: "GET" })
  .validator(checked(student))
  .handler(({ data }) => record(backend().identifiers.list(data)));

export const revealIdentifier = createServerFn({ method: "POST" })
  .validator(checked(v.object({ id: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => backend().identifiers.reveal(data));

export const saveIdentifier = createServerFn({ method: "POST" })
  .validator(checked(saveIdentifierSchema))
  .handler(({ data }) => backend().identifiers.save(data));

export const removeIdentifier = createServerFn({ method: "POST" })
  .validator(checked(identifierRefSchema))
  .handler(({ data }) => backend().identifiers.remove(data));
