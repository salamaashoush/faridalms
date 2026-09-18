import {
  accessChangesQuerySchema,
  assignAccessRoleSchema,
  saveAccessRoleSchema,
} from "@faridalms/domain/access";
import { ROLES } from "@faridalms/domain/identity";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";

const parse =
  <T extends v.GenericSchema>(schema: T) =>
  (input: unknown) =>
    v.parse(schema, input);

export const getAccessRoles = createServerFn({ method: "GET" }).handler(() =>
  backend().getAccessRoles(),
);
export const saveAccessRole = createServerFn({ method: "POST" })
  .validator(
    parse(
      v.object({
        ...saveAccessRoleSchema.entries,
        builtinRole: v.optional(v.nullable(v.picklist(ROLES)), null),
      }),
    ),
  )
  .handler(({ data }) => backend().saveAccessRole(data));
export const assignAccessRole = createServerFn({ method: "POST" })
  .validator(parse(assignAccessRoleSchema))
  .handler(({ data }) => backend().assignAccessRole(data));
export const getUserAccess = createServerFn({ method: "GET" })
  .validator(parse(v.object({ userId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => backend().getUserAccess(data));
export const getAccessChanges = createServerFn({ method: "GET" })
  .validator(parse(accessChangesQuerySchema))
  .handler(({ data }) => backend().getAccessChanges(data));
