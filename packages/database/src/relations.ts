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
    files: r.many.privateFiles(),
    notifications: r.many.notifications(),
    notificationPreferences: r.one.notificationPreferences({
      from: r.users.id,
      to: r.notificationPreferences.userId,
    }),
  },

  notificationEvents: {
    actor: r.one.users({
      from: r.notificationEvents.actorId,
      to: r.users.id,
    }),
    notifications: r.many.notifications(),
  },

  notifications: {
    event: r.one.notificationEvents({
      from: r.notifications.eventId,
      to: r.notificationEvents.id,
    }),
    recipient: r.one.users({
      from: r.notifications.recipientId,
      to: r.users.id,
    }),
    deliveries: r.many.notificationDeliveries(),
  },

  notificationDeliveries: {
    notification: r.one.notifications({
      from: r.notificationDeliveries.notificationId,
      to: r.notifications.id,
    }),
  },

  notificationPreferences: {
    user: r.one.users({
      from: r.notificationPreferences.userId,
      to: r.users.id,
    }),
  },

  announcements: {
    schoolYear: r.one.schoolYears({
      from: r.announcements.schoolYearId,
      to: r.schoolYears.id,
    }),
    author: r.one.users({
      from: r.announcements.authorId,
      to: r.users.id,
    }),
  },

  privateFiles: {
    owner: r.one.users({
      from: r.privateFiles.ownerId,
      to: r.users.id,
    }),
    lessonLinks: r.many.lessonFiles(),
    resourceLinks: r.many.assignmentResources(),
    attemptLinks: r.many.submissionAttemptFiles(),
    draftLinks: r.many.submissionDraftFiles(),
    messageLinks: r.many.messageAttachments(),
    messageDraftLinks: r.many.messageDraftFiles(),
  },

  messageDrafts: {
    author: r.one.users({
      from: r.messageDrafts.authorId,
      to: r.users.id,
    }),
    files: r.many.messageDraftFiles(),
  },

  messageDraftFiles: {
    draft: r.one.messageDrafts({
      from: r.messageDraftFiles.draftId,
      to: r.messageDrafts.id,
    }),
    file: r.one.privateFiles({
      from: r.messageDraftFiles.fileId,
      to: r.privateFiles.id,
    }),
  },

  studentGroups: {
    class: r.one.classes({
      from: r.studentGroups.classId,
      to: r.classes.id,
    }),
    members: r.many.studentGroupMembers(),
  },

  studentGroupMembers: {
    group: r.one.studentGroups({
      from: r.studentGroupMembers.groupId,
      to: r.studentGroups.id,
    }),
    student: r.one.students({
      from: r.studentGroupMembers.studentId,
      to: r.students.id,
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
    assignmentRecipients: r.many.assignmentRecipients(),
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
    groups: r.many.studentGroups(),
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
    recipients: r.many.assignmentRecipients(),
    resources: r.many.assignmentResources(),
  },

  assignmentRecipients: {
    assignment: r.one.assignments({
      from: r.assignmentRecipients.assignmentId,
      to: r.assignments.id,
    }),
    student: r.one.students({
      from: r.assignmentRecipients.studentId,
      to: r.students.id,
    }),
  },

  assignmentResources: {
    assignment: r.one.assignments({
      from: r.assignmentResources.assignmentId,
      to: r.assignments.id,
    }),
    file: r.one.privateFiles({
      from: r.assignmentResources.fileId,
      to: r.privateFiles.id,
    }),
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
    attempts: r.many.submissionAttempts(),
    draftFiles: r.many.submissionDraftFiles(),
    currentAttempt: r.one.submissionAttempts({
      from: r.submissions.currentAttemptId,
      to: r.submissionAttempts.id,
    }),
    gradedBy: r.one.users({
      from: r.submissions.gradedById,
      to: r.users.id,
    }),
  },

  submissionDraftFiles: {
    submission: r.one.submissions({
      from: r.submissionDraftFiles.submissionId,
      to: r.submissions.id,
    }),
    file: r.one.privateFiles({
      from: r.submissionDraftFiles.fileId,
      to: r.privateFiles.id,
    }),
  },

  submissionAttempts: {
    submission: r.one.submissions({
      from: r.submissionAttempts.submissionId,
      to: r.submissions.id,
    }),
    files: r.many.submissionAttemptFiles(),
    assessment: r.one.assessments({
      from: r.submissionAttempts.id,
      to: r.assessments.attemptId,
    }),
    submittedBy: r.one.users({
      from: r.submissionAttempts.submittedById,
      to: r.users.id,
    }),
  },

  submissionAttemptFiles: {
    attempt: r.one.submissionAttempts({
      from: r.submissionAttemptFiles.attemptId,
      to: r.submissionAttempts.id,
    }),
    file: r.one.privateFiles({
      from: r.submissionAttemptFiles.fileId,
      to: r.privateFiles.id,
    }),
  },

  assessments: {
    attempt: r.one.submissionAttempts({
      from: r.assessments.attemptId,
      to: r.submissionAttempts.id,
    }),
    gradedBy: r.one.users({
      from: r.assessments.gradedById,
      to: r.users.id,
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
    parent: r.one.messages({
      from: r.messages.parentMessageId,
      to: r.messages.id,
    }),
    replies: r.many.messages({
      from: r.messages.id,
      to: r.messages.parentMessageId,
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
    file: r.one.privateFiles({
      from: r.messageAttachments.fileId,
      to: r.privateFiles.id,
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

  siteSettings: {
    logo: r.one.privateFiles({
      from: r.siteSettings.logoFileId,
      to: r.privateFiles.id,
    }),
  },

  sitePages: {
    author: r.one.users({
      from: r.sitePages.authorId,
      to: r.users.id,
    }),
  },

  sitePostCategories: {
    posts: r.many.sitePosts(),
  },

  sitePosts: {
    category: r.one.sitePostCategories({
      from: r.sitePosts.categoryId,
      to: r.sitePostCategories.id,
    }),
    cover: r.one.privateFiles({
      from: r.sitePosts.coverFileId,
      to: r.privateFiles.id,
    }),
    author: r.one.users({
      from: r.sitePosts.authorId,
      to: r.users.id,
    }),
    revisions: r.many.sitePostRevisions(),
  },

  learningModules: {
    class: r.one.classes({
      from: r.learningModules.classId,
      to: r.classes.id,
    }),
    subject: r.one.subjects({
      from: r.learningModules.subjectId,
      to: r.subjects.id,
    }),
    author: r.one.users({
      from: r.learningModules.authorId,
      to: r.users.id,
    }),
    lessons: r.many.lessons(),
  },

  lessons: {
    module: r.one.learningModules({
      from: r.lessons.moduleId,
      to: r.learningModules.id,
    }),
    files: r.many.lessonFiles(),
    progress: r.many.lessonProgress(),
  },

  lessonFiles: {
    lesson: r.one.lessons({
      from: r.lessonFiles.lessonId,
      to: r.lessons.id,
    }),
    file: r.one.privateFiles({
      from: r.lessonFiles.fileId,
      to: r.privateFiles.id,
    }),
  },

  lessonProgress: {
    lesson: r.one.lessons({
      from: r.lessonProgress.lessonId,
      to: r.lessons.id,
    }),
    student: r.one.students({
      from: r.lessonProgress.studentId,
      to: r.students.id,
    }),
  },

  sitePostRevisions: {
    post: r.one.sitePosts({
      from: r.sitePostRevisions.postId,
      to: r.sitePosts.id,
    }),
    savedBy: r.one.users({
      from: r.sitePostRevisions.savedById,
      to: r.users.id,
    }),
  },
}));
