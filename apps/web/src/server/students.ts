import {
  endRelationshipSchema,
  guardianLookupSchema,
  saveRelationshipSchema,
  saveStudentSchema,
  studentDirectorySchema,
  studentMatchesSchema,
} from "@faridalms/domain/people";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";

/**
 * Checks the input here for a fast refusal and forwards it as typed: the API
 * parses it again, and some fields only take their final form there.
 */
function checked<S extends v.GenericSchema>(schema: S) {
  return (input: v.InferInput<S>) => {
    v.parse(schema, input);
    return input;
  };
}

const byId = (input: unknown) =>
  v.parse(v.object({ id: v.pipe(v.string(), v.uuid()) }), input);

export const getPeopleOptions = createServerFn({ method: "GET" }).handler(() =>
  backend().people.options(),
);

export const getStudents = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(studentDirectorySchema, input))
  .handler(({ data }) => backend().people.students(data));

export const getStudentRecord = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().people.student(data)));

export const getStudentHistory = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().people.studentHistory(data)));

export const getStudentMatches = createServerFn({ method: "GET" })
  .validator(checked(studentMatchesSchema))
  .handler(({ data }) => backend().people.matches(data));

export const findGuardians = createServerFn({ method: "GET" })
  .validator((input: unknown) => v.parse(guardianLookupSchema, input))
  .handler(({ data }) => backend().people.findGuardians(data));

export const saveStudent = createServerFn({ method: "POST" })
  .validator(checked(saveStudentSchema))
  .handler(({ data }) => backend().people.saveStudent(data));

export const saveRelationship = createServerFn({ method: "POST" })
  .validator(checked(saveRelationshipSchema))
  .handler(({ data }) => backend().people.saveRelationship(data));

export const endRelationship = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof endRelationshipSchema>) =>
    v.parse(endRelationshipSchema, input),
  )
  .handler(({ data }) => backend().people.endLink(data));

export const getPersonRecord = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().people.person(data)));

export const getPersonHistory = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().people.personHistory(data)));
