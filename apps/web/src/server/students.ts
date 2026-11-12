import {
  createSignInsSchema,
  sendSignInLinkSchema,
} from "@faridalms/domain/first-sign-in";
import { historyQuerySchema } from "@faridalms/domain/history";
import {
  accountStateSchema,
  cancelLeavingSchema,
  contactLookupSchema,
  personSearchSchema,
  recordLeavingSchema,
  saveContactsSchema,
  saveSignInSchema,
  saveStudentSchema,
  setPhotoSchema,
  studentDirectoryInputSchema,
  studentMatchesSchema,
} from "@faridalms/domain/people";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

export const getPeopleOptions = createServerFn({ method: "GET" }).handler(() =>
  backend().people.options(),
);

export const getStudents = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(studentDirectoryInputSchema, input))
  .handler(({ data }) => record(backend().people.students(data)));

export const getStudentRecord = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().people.student(data)));

export const getStudentHistory = createServerFn({ method: "GET" })
  .validator(checked(historyQuerySchema))
  .handler(({ data }) => record(backend().people.studentHistory(data)));

export const getStudentMatches = createServerFn({ method: "GET" })
  .validator(checked(studentMatchesSchema))
  .handler(({ data }) => backend().people.matches(data));

export const findByContact = createServerFn({ method: "GET" })
  .validator(checked(contactLookupSchema))
  .handler(({ data }) => backend().people.findByContact(data));

export const saveStudent = createServerFn({ method: "POST" })
  .validator(checked(saveStudentSchema))
  .handler(({ data }) => backend().people.saveStudent(data));

export const getPersonRecord = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().people.person(data)));

export const getPersonProfile = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().people.profile(data)));

export const getPersonHistory = createServerFn({ method: "GET" })
  .validator(checked(historyQuerySchema))
  .handler(({ data }) => record(backend().people.personHistory(data)));

export const saveSignIn = createServerFn({ method: "POST" })
  .validator(checked(saveSignInSchema))
  .handler(({ data }) => backend().people.saveSignIn(data));

export const sendSignInLink = createServerFn({ method: "POST" })
  .validator(checked(sendSignInLinkSchema))
  .handler(({ data }) => backend().people.sendSignInLink(data));

export const recordLeaving = createServerFn({ method: "POST" })
  .validator(checked(recordLeavingSchema))
  .handler(({ data }) => backend().people.recordLeaving(data));

export const cancelLeaving = createServerFn({ method: "POST" })
  .validator(checked(cancelLeavingSchema))
  .handler(({ data }) => backend().people.cancelLeaving(data));

export const getSignInsPlan = createServerFn({ method: "GET" })
  .validator(checked(createSignInsSchema))
  .handler(({ data }) => backend().people.signInsPlan(data));

export const createSignIns = createServerFn({ method: "POST" })
  .validator(checked(createSignInsSchema))
  .handler(({ data }) => backend().people.createSignIns(data));

export const setSignInState = createServerFn({ method: "POST" })
  .validator(checked(accountStateSchema))
  .handler(({ data }) => backend().people.setSignInState(data));

export const changePhoto = createServerFn({ method: "POST" })
  .validator(checked(setPhotoSchema))
  .handler(({ data }) => backend().people.setPhoto(data));

export const saveContacts = createServerFn({ method: "POST" })
  .validator(checked(saveContactsSchema))
  .handler(({ data }) => backend().people.saveContacts(data));

export const searchPeople = createServerFn({ method: "GET" })
  .validator(checked(personSearchSchema))
  .handler(({ data }) => backend().people.searchPeople(data));
