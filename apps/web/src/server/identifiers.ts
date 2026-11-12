import {
  identifierRefSchema,
  saveIdentifierSchema,
} from "@faridalms/domain/identifiers";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { checked } from "./input";

const student = v.object({ studentId: v.pipe(v.string(), v.uuid()) });

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
