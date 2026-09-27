import {
  addHouseholdMemberSchema,
  endHouseholdMemberSchema,
  householdsQuerySchema,
  personSearchSchema,
  saveHouseholdSchema,
} from "@faridalms/domain/people";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

export const getHouseholds = createServerFn({ method: "GET" })
  .validator(checked(householdsQuerySchema))
  .handler(({ data }) => backend().people.households(data));

export const getHousehold = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().people.household(data)));

export const getHouseholdsOf = createServerFn({ method: "GET" })
  .validator(checked(v.object({ userId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => record(backend().people.householdsOfPerson(data)));

export const saveHousehold = createServerFn({ method: "POST" })
  .validator(checked(saveHouseholdSchema))
  .handler(({ data }) => backend().people.saveHousehold(data));

export const addToHousehold = createServerFn({ method: "POST" })
  .validator(checked(addHouseholdMemberSchema))
  .handler(({ data }) => backend().people.addToHousehold(data));

export const endHouseholdMembership = createServerFn({ method: "POST" })
  .validator(checked(endHouseholdMemberSchema))
  .handler(({ data }) => backend().people.endHouseholdMembership(data));

export const searchPeople = createServerFn({ method: "GET" })
  .validator(checked(personSearchSchema))
  .handler(({ data }) => backend().people.searchPeople(data));
