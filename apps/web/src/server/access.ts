import {
  accessChangesSchema,
  assignAccessRoleSchema,
  endAccessAssignmentSchema,
  saveAccessRoleSchema,
} from "@faridalms/domain/people";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { checked } from "./input";

export const getAccessRoles = createServerFn({ method: "GET" }).handler(() =>
  backend().access.roles(),
);

export const saveAccessRole = createServerFn({ method: "POST" })
  .validator(checked(saveAccessRoleSchema))
  .handler(({ data }) => backend().access.saveRole(data));

export const getPersonAccess = createServerFn({ method: "GET" })
  .validator(checked(v.object({ userId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => record(backend().access.personAccess(data)));

export const assignAccessRole = createServerFn({ method: "POST" })
  .validator(checked(assignAccessRoleSchema))
  .handler(({ data }) => backend().access.assign(data));

export const endAccessAssignment = createServerFn({ method: "POST" })
  .validator(checked(endAccessAssignmentSchema))
  .handler(({ data }) => backend().access.endAssignmentOf(data));

export const getAccessChanges = createServerFn({ method: "GET" })
  .validator(checked(accessChangesSchema))
  .handler(({ data }) => backend().access.changes(data));
