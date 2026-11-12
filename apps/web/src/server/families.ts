import {
  attachCourtOrderSchema,
  childrenOfSchema,
  endRelationshipSchema,
  removeCourtOrderSchema,
  saveCustodySchema,
  saveRelationshipSchema,
} from "@faridalms/domain/families";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

const student = v.object({ studentId: v.pipe(v.string(), v.uuid()) });

export const getRelations = createServerFn({ method: "GET" }).handler(() =>
  backend().guardians.relations(),
);

export const getGuardians = createServerFn({ method: "GET" })
  .validator(checked(student))
  .handler(({ data }) => record(backend().guardians.ofStudent(data)));

export const saveRelationship = createServerFn({ method: "POST" })
  .validator(checked(saveRelationshipSchema))
  .handler(({ data }) => backend().guardians.saveLink(data));

export const endRelationship = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof endRelationshipSchema>) =>
    v.parse(endRelationshipSchema, input),
  )
  .handler(({ data }) => backend().guardians.endLink(data));

export const getSiblings = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().guardians.siblings(data)));

export const getGuardianNotices = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().guardians.notices(data)));

export const getChildren = createServerFn({ method: "GET" })
  .validator(checked(childrenOfSchema))
  .handler(({ data }) => record(backend().guardians.children(data)));

export const getWithoutGuardian = createServerFn({ method: "GET" }).handler(
  () => backend().guardians.withoutGuardian(),
);

export const getCustody = createServerFn({ method: "GET" })
  .validator(checked(student))
  .handler(({ data }) => record(backend().guardians.custody(data)));

export const saveCustody = createServerFn({ method: "POST" })
  .validator(checked(saveCustodySchema))
  .handler(({ data }) => backend().guardians.saveCustody(data));

export const attachCourtOrder = createServerFn({ method: "POST" })
  .validator(checked(attachCourtOrderSchema))
  .handler(({ data }) => backend().guardians.attachCourtOrder(data));

export const removeCourtOrder = createServerFn({ method: "POST" })
  .validator(checked(removeCourtOrderSchema))
  .handler(({ data }) => backend().guardians.removeCourtOrder(data));
