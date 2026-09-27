import {
  saveStaffSchema,
  staffDirectorySchema,
} from "@faridalms/domain/people";
import { createServerFn } from "@tanstack/react-start";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

export const getStaff = createServerFn({ method: "GET" })
  .validator(checked(staffDirectorySchema))
  .handler(({ data }) => backend().people.staff(data));

export const getStaffMember = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().people.staffMember(data)));

export const saveStaff = createServerFn({ method: "POST" })
  .validator(checked(saveStaffSchema))
  .handler(({ data }) => backend().people.saveStaff(data));
