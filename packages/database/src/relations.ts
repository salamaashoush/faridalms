import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

/**
 * Relational config for the query builder (`db.query.*`).
 *
 * Drizzle v1 keeps this out of the table definitions, which is also why
 * drizzle-kit reads `schema.ts` alone: migrations depend on tables, never on
 * how the application chooses to traverse them.
 */
export const relations = defineRelations(schema, (r) => ({
  users: {
    guardianships: r.many.guardianships(),
    homeroomClasses: r.many.classes(),
    sentMessages: r.many.messages(),
    inbox: r.many.messageRecipients(),
    studentRecord: r.one.students({
      from: r.users.id,
      to: r.students.userId,
    }),
  },

  students: {
    account: r.one.users({
      from: r.students.userId,
      to: r.users.id,
    }),
    contact: r.one.studentContacts({
      from: r.students.id,
      to: r.studentContacts.studentId,
    }),
    medical: r.one.studentMedical({
      from: r.students.id,
      to: r.studentMedical.studentId,
    }),
    emergencyContacts: r.many.emergencyContacts(),
    medicalReports: r.many.medicalReports(),
    guardianships: r.many.guardianships(),
    enrolments: r.many.enrolments(),
    submissions: r.many.submissions(),
    attendance: r.many.attendance(),
    grades: r.many.grades(),
  },

  studentContacts: {
    student: r.one.students({
      from: r.studentContacts.studentId,
      to: r.students.id,
    }),
  },

  studentMedical: {
    student: r.one.students({
      from: r.studentMedical.studentId,
      to: r.students.id,
    }),
  },

  emergencyContacts: {
    student: r.one.students({
      from: r.emergencyContacts.studentId,
      to: r.students.id,
    }),
  },

  medicalReports: {
    student: r.one.students({
      from: r.medicalReports.studentId,
      to: r.students.id,
    }),
  },

  guardianships: {
    guardian: r.one.users({
      from: r.guardianships.guardianId,
      to: r.users.id,
    }),
    student: r.one.students({
      from: r.guardianships.studentId,
      to: r.students.id,
    }),
  },

  schoolYears: {
    classes: r.many.classes(),
    terms: r.many.terms(),
    weeks: r.many.academicWeeks(),
    newsletters: r.many.newsletters(),
    events: r.many.calendarEvents(),
  },

  classes: {
    schoolYear: r.one.schoolYears({
      from: r.classes.schoolYearId,
      to: r.schoolYears.id,
    }),
    homeroomTeacher: r.one.users({
      from: r.classes.homeroomTeacherId,
      to: r.users.id,
    }),
    enrolments: r.many.enrolments(),
    classSubjects: r.many.classSubjects(),
    assignments: r.many.assignments(),
    timetableSlots: r.many.timetableSlots(),
    attendance: r.many.attendance(),
  },

  enrolments: {
    student: r.one.students({
      from: r.enrolments.studentId,
      to: r.students.id,
    }),
    class: r.one.classes({
      from: r.enrolments.classId,
      to: r.classes.id,
    }),
  },

  classSubjects: {
    class: r.one.classes({
      from: r.classSubjects.classId,
      to: r.classes.id,
    }),
    subject: r.one.subjects({
      from: r.classSubjects.subjectId,
      to: r.subjects.id,
    }),
    teacher: r.one.users({
      from: r.classSubjects.teacherId,
      to: r.users.id,
    }),
  },

  subjects: {
    classSubjects: r.many.classSubjects(),
    assignments: r.many.assignments(),
    grades: r.many.grades(),
  },

  terms: {
    schoolYear: r.one.schoolYears({
      from: r.terms.schoolYearId,
      to: r.schoolYears.id,
    }),
    grades: r.many.grades(),
  },

  academicWeeks: {
    schoolYear: r.one.schoolYears({
      from: r.academicWeeks.schoolYearId,
      to: r.schoolYears.id,
    }),
    assignments: r.many.assignments(),
  },

  assignments: {
    class: r.one.classes({
      from: r.assignments.classId,
      to: r.classes.id,
    }),
    subject: r.one.subjects({
      from: r.assignments.subjectId,
      to: r.subjects.id,
    }),
    week: r.one.academicWeeks({
      from: r.assignments.weekId,
      to: r.academicWeeks.id,
    }),
    author: r.one.users({
      from: r.assignments.authorId,
      to: r.users.id,
    }),
    submissions: r.many.submissions(),
  },

  submissions: {
    assignment: r.one.assignments({
      from: r.submissions.assignmentId,
      to: r.assignments.id,
    }),
    student: r.one.students({
      from: r.submissions.studentId,
      to: r.students.id,
    }),
    files: r.many.submissionFiles(),
    gradedBy: r.one.users({
      from: r.submissions.gradedById,
      to: r.users.id,
    }),
  },

  submissionFiles: {
    submission: r.one.submissions({
      from: r.submissionFiles.submissionId,
      to: r.submissions.id,
    }),
  },

  grades: {
    student: r.one.students({
      from: r.grades.studentId,
      to: r.students.id,
    }),
    subject: r.one.subjects({
      from: r.grades.subjectId,
      to: r.subjects.id,
    }),
    term: r.one.terms({
      from: r.grades.termId,
      to: r.terms.id,
    }),
    teacher: r.one.users({
      from: r.grades.teacherId,
      to: r.users.id,
    }),
  },

  attendance: {
    student: r.one.students({
      from: r.attendance.studentId,
      to: r.students.id,
    }),
    class: r.one.classes({
      from: r.attendance.classId,
      to: r.classes.id,
    }),
    recordedBy: r.one.users({
      from: r.attendance.recordedById,
      to: r.users.id,
    }),
  },

  timetableSlots: {
    class: r.one.classes({
      from: r.timetableSlots.classId,
      to: r.classes.id,
    }),
    subject: r.one.subjects({
      from: r.timetableSlots.subjectId,
      to: r.subjects.id,
    }),
    teacher: r.one.users({
      from: r.timetableSlots.teacherId,
      to: r.users.id,
    }),
  },

  messages: {
    sender: r.one.users({
      from: r.messages.senderId,
      to: r.users.id,
    }),
    student: r.one.students({
      from: r.messages.studentId,
      to: r.students.id,
    }),
    recipients: r.many.messageRecipients(),
    attachments: r.many.messageAttachments(),
  },

  messageRecipients: {
    message: r.one.messages({
      from: r.messageRecipients.messageId,
      to: r.messages.id,
    }),
    recipient: r.one.users({
      from: r.messageRecipients.recipientId,
      to: r.users.id,
    }),
  },

  messageAttachments: {
    message: r.one.messages({
      from: r.messageAttachments.messageId,
      to: r.messages.id,
    }),
  },

  newsletters: {
    schoolYear: r.one.schoolYears({
      from: r.newsletters.schoolYearId,
      to: r.schoolYears.id,
    }),
  },

  calendarEvents: {
    schoolYear: r.one.schoolYears({
      from: r.calendarEvents.schoolYearId,
      to: r.schoolYears.id,
    }),
  },
}));
