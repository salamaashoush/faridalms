import {
  arrangementsRefSchema,
  saveArrangementsSchema,
} from "@faridalms/domain/arrangements";
import {
  identifierRefSchema,
  saveIdentifierSchema,
} from "@faridalms/domain/identifiers";
import {
  askHealthChangeSchema,
  attachHealthReportSchema,
  decideHealthChangeSchema,
  healthChangesSchema,
  removeHealthRecordSchema,
  removeHealthReportSchema,
  saveDemographicsSchema,
  saveHealthRecordSchema,
  shareHealthReportSchema,
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

export const attachHealthReport = createServerFn({ method: "POST" })
  .validator(checked(attachHealthReportSchema))
  .handler(({ data }) => backend().records.attachHealthReport(data));

export const shareHealthReport = createServerFn({ method: "POST" })
  .validator(checked(shareHealthReportSchema))
  .handler(({ data }) => backend().records.shareReport(data));

export const removeHealthReport = createServerFn({ method: "POST" })
  .validator(checked(removeHealthReportSchema))
  .handler(({ data }) => backend().records.removeReport(data));

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

export const getSummary = createServerFn({ method: "GET" })
  .validator(checked(student))
  .handler(({ data }) => record(backend().records.summary(data)));

export const askHealthChange = createServerFn({ method: "POST" })
  .validator(checked(askHealthChangeSchema))
  .handler(({ data }) => backend().records.askChange(data));

export const getHealthChanges = createServerFn({ method: "GET" })
  .validator(checked(healthChangesSchema))
  .handler(({ data }) => backend().records.healthChanges(data));

export const decideHealthChange = createServerFn({ method: "POST" })
  .validator(checked(decideHealthChangeSchema))
  .handler(({ data }) => backend().records.decideHealthChange(data));
