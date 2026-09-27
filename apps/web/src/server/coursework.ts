import {
  assessSchema,
  handInSchema,
  publishSchema,
  saveAssignmentSchema,
  saveDraftSchema,
  saveGroupSchema,
  saveRubricSchema,
  studentWorkActionSchema,
  teacherListSchema,
} from "@faridalms/domain/coursework";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { byId, checked } from "./input";

const uuid = v.pipe(v.string(), v.uuid());

export const getCourseworkOptions = createServerFn({ method: "GET" }).handler(
  () => record(backend().coursework.options()),
);

export const getCoursework = createServerFn({ method: "GET" })
  .validator(checked(teacherListSchema))
  .handler(({ data }) => record(backend().coursework.list(data)));

export const getAssignmentEditor = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().coursework.editor(data)));

export const getAssignmentRecord = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().coursework.record(data)));

export const getGrading = createServerFn({ method: "GET" })
  .validator(checked(v.object({ assignmentId: uuid, studentId: uuid })))
  .handler(({ data }) => record(backend().coursework.grading(data)));

export const getMyWork = createServerFn({ method: "GET" })
  .validator(byId)
  .handler(({ data }) => record(backend().coursework.work(data)));

export const getMyCoursework = createServerFn({ method: "GET" }).handler(() =>
  record(backend().coursework.mine()),
);

export const getChildCoursework = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: uuid })))
  .handler(({ data }) => record(backend().coursework.child(data)));

export const getStudentCoursework = createServerFn({ method: "GET" })
  .validator(checked(v.object({ studentId: uuid })))
  .handler(({ data }) => record(backend().coursework.student(data)));

export const getClassGroups = createServerFn({ method: "GET" })
  .validator(checked(v.object({ classId: uuid })))
  .handler(({ data }) => record(backend().coursework.groups(data)));

export const saveAssignment = createServerFn({ method: "POST" })
  .validator(checked(saveAssignmentSchema))
  .handler(({ data }) => backend().coursework.save(data));

export const publishAssignment = createServerFn({ method: "POST" })
  .validator(checked(publishSchema))
  .handler(({ data }) => backend().coursework.publish(data));

export const archiveAssignment = createServerFn({ method: "POST" })
  .validator(checked(publishSchema))
  .handler(({ data }) => backend().coursework.archive(data));

export const actOnWork = createServerFn({ method: "POST" })
  .validator(checked(studentWorkActionSchema))
  .handler(({ data }) => backend().coursework.act(data));

export const assessAttempt = createServerFn({ method: "POST" })
  .validator(checked(assessSchema))
  .handler(({ data }) => backend().coursework.assess(data));

export const saveMyDraft = createServerFn({ method: "POST" })
  .validator(checked(saveDraftSchema))
  .handler(({ data }) => backend().coursework.saveDraft(data));

export const handInWork = createServerFn({ method: "POST" })
  .validator(checked(handInSchema))
  .handler(({ data }) => backend().coursework.handIn(data));

export const undoHandIn = createServerFn({ method: "POST" })
  .validator(checked(v.object({ assignmentId: uuid })))
  .handler(({ data }) => backend().coursework.undoHandIn(data));

export const saveClassGroup = createServerFn({ method: "POST" })
  .validator(checked(saveGroupSchema))
  .handler(({ data }) => backend().coursework.saveClassGroup(data));

export const saveRubric = createServerFn({ method: "POST" })
  .validator(checked(saveRubricSchema))
  .handler(({ data }) => backend().coursework.saveTeacherRubric(data));
