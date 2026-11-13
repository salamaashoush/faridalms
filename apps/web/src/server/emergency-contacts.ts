import {
  removeEmergencyContactSchema,
  saveEmergencyContactSchema,
} from "@faridalms/domain/emergency-contacts";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";
import { checked } from "./input";

export const getEmergencyContacts = createServerFn({ method: "GET" })
  .validator(checked(v.object({ personId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => backend().people.emergencyContacts(data));

export const saveEmergencyContact = createServerFn({ method: "POST" })
  .validator(checked(saveEmergencyContactSchema))
  .handler(({ data }) => backend().people.saveEmergencyContact(data));

export const removeEmergencyContact = createServerFn({ method: "POST" })
  .validator(checked(removeEmergencyContactSchema))
  .handler(({ data }) => backend().people.removeEmergencyContact(data));
