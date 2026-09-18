import * as v from "valibot";

import { PERMISSIONS, ROLES } from "./identity";

export const saveAccessRoleSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.uuid())),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(128)),
  baseRole: v.picklist(ROLES),
  builtinRole: v.optional(v.picklist(ROLES)),
  permissions: v.pipe(
    v.array(v.picklist(PERMISSIONS)),
    v.maxLength(PERMISSIONS.length),
  ),
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export const assignAccessRoleSchema = v.object({
  userId: v.pipe(v.string(), v.uuid()),
  accessRoleId: v.nullable(v.pipe(v.string(), v.uuid())),
  expectedRevision: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
export type SaveAccessRoleInput = v.InferOutput<typeof saveAccessRoleSchema>;
