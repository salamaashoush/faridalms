import { emptyApplicationForm } from "@faridalms/domain/admissions";
import { and, eq, sql } from "drizzle-orm";

import type { CellTransaction } from "../src/context";

import { writeAudit } from "../src/audit";
import { withPurpose } from "../src/context";
import { insertEvent, insertLetter } from "../src/stores/admission-decisions";
import {
  insertApplication,
  insertApplicationEntry,
  insertForm as insertAdmissionForm,
  insertIntake,
  publishForm as publishAdmissionForm,
} from "../src/stores/admissions";
import { setOrgFeature } from "../src/stores/school";
import {
  absenceReports,
  academicSessions,
  accessRoles,
  attendanceContacts,
  attendanceSettings,
  siteEnquiries,
  siteEnquiryEntries,
  messageDrafts,
  accounts,
  calendarFeeds,
  calendarGradeLevels,
  calendars,
  consentRecords,
  descriptorOverrides,
  descriptors,
  devices,
  documentFiles,
  documentLinks,
  documentTemplates,
  bankQuestions,
  sharedBlocks,
  standardFrameworks,
  standardEvidence,
  standards,
  goalJudgements,
  healthChanges,
  standardObservations,
  attemptAuthentications,
  attemptDeclarations,
  courseworkAssessments,
  examBoards,
  examSessions,
  gradeScales,
  gradeScaleVersions,
  programmeCategories,
  breaches,
  recordsRequests,
  retentionSettings,
  programmeGradeLevels,
  programmes,
  familyShares,
  lessonChanges,
  staffAbsences,
  studentMovements,
  workComments,
  workCommentReplies,
  workCommentAnswers,
  bankComments,
  captionDrafts,
  submissionAttempts,
  documentTranslations,
  documents,
  documentVersions,
  erasureApprovals,
  erasureItems,
  filePublications,
  fileSubjects,
  files,
  identityProviderOrgs,
  identityProviders,
  importRows,
  importRuns,
  legalHolds,
  lessonCode,
  lessonProjects,
  lessonShares,
  lessonResponses,
  lessonRuns,
  lessonWatches,
  lessons,
  moduleAudiences,
  moduleClasses,
  pacedLessons,
  lessonReleases,
  lessonOpenings,
  programRemarks,
  discussionPosts,
  ltiKeys,
  ltiLineItems,
  ltiReplays,
  ltiScores,
  ltiTools,
  peerReviews,
  passkeys,
  quizAnswers,
  quizDraws,
  quizSittings,
  accessArrangements,
  submissions,
  privacyNotices,
  relationshipRestrictions,
  savedViews,
  sealBatches,
  sealMembers,
  anchors,
  sessions,
  authAttempts,
  userPreferences,
  userRelationships,
  users,
  loginIdentities,
  yearRollovers,
} from "../src/tables/index";

const id = () => Bun.randomUUIDv7();
const bytes = (length: number) =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(length)));

async function descriptor(
  tx: CellTransaction,
  tenantId: string,
  namespace: string,
  code: string,
) {
  const [row] = await tx
    .select({ id: descriptors.id })
    .from(descriptors)
    .where(
      and(
        eq(descriptors.tenantId, tenantId),
        eq(descriptors.namespace, namespace),
        eq(descriptors.codeValue, code),
      ),
    );
  if (!row) throw new Error(`descriptor ${namespace}/${code} missing`);
  return row.id;
}

/**
 * Adds one valid row to every tenant table the development seed leaves
 * empty, so the isolation suite has a row of each tenant in each table.
 */
export async function completeFixture(
  tx: CellTransaction,
  tenantId: string,
  schoolId: string,
) {
  const [someone] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .limit(1);
  const [account] = await tx
    .select({ id: accounts.id, userId: accounts.userId })
    .from(accounts)
    .where(eq(accounts.tenantId, tenantId))
    .limit(1);
  const [identity] = await tx
    .select({ id: loginIdentities.id })
    .from(loginIdentities)
    .where(eq(loginIdentities.tenantId, tenantId))
    .limit(1);
  const [relationship] = await tx
    .select({
      id: userRelationships.id,
      student: userRelationships.studentUserId,
      related: userRelationships.relatedUserId,
    })
    .from(userRelationships)
    .where(eq(userRelationships.tenantId, tenantId))
    .limit(1);
  const [calendar] = await tx
    .select({ id: calendars.id })
    .from(calendars)
    .where(eq(calendars.tenantId, tenantId))
    .limit(1);
  if (!someone || !account || !identity || !relationship || !calendar)
    throw new Error("the development seed must run before the fixture");
  const userId = someone.id;

  await setOrgFeature(tx, {
    tenantId,
    orgId: schoolId,
    feature: "elearning",
    enabled: true,
  });
  await tx.insert(descriptorOverrides).values({
    tenantId,
    descriptorId: await descriptor(tx, tenantId, "grade_level", "grade_8"),
    orgId: schoolId,
    labelAr: "الصف الثاني الإعدادي",
  });
  await tx.insert(calendarGradeLevels).values({
    tenantId,
    calendarId: calendar.id,
    gradeLevelDescriptorId: await descriptor(
      tx,
      tenantId,
      "grade_level",
      "grade_7",
    ),
  });

  const photoId = id();
  await tx.insert(files).values({
    tenantId,
    id: photoId,
    uploadedByUserId: userId,
    hostType: "user",
    hostId: userId,
    purpose: "site_media",
    name: "sports-day.jpg",
    mediaType: "image/jpeg",
    sizeBytes: 1024,
    storageKey: `t/${tenantId}/f/${photoId}`,
    linkedAt: new Date(),
  });
  await tx.insert(filePublications).values({
    tenantId,
    fileId: photoId,
    filePurpose: "site_media",
    publicKey: `p/${"a".repeat(26)}/sports-day.jpg`,
    hostType: "site_page",
    hostId: id(),
  });
  await tx
    .insert(fileSubjects)
    .values({ tenantId, fileId: photoId, userId, taggedByUserId: userId });

  const courtOrder = id();
  const evidence = id();
  await withPurpose(tx, "custody", async (inner) => {
    await inner.insert(files).values([
      {
        tenantId,
        id: courtOrder,
        purpose: "legal_document",
        name: "court-order.pdf",
        mediaType: "application/pdf",
        sizeBytes: 2048,
        storageKey: `t/${tenantId}/q/${courtOrder}`,
      },
      {
        tenantId,
        id: evidence,
        purpose: "evidence",
        name: "guardianship.pdf",
        mediaType: "application/pdf",
        sizeBytes: 2048,
        storageKey: `t/${tenantId}/q/${evidence}`,
      },
    ]);
    await inner.insert(relationshipRestrictions).values({
      tenantId,
      relationshipId: relationship.id,
      contactRestrictions: "Not to collect the student.",
      courtOrderFileId: courtOrder,
      verificationFileId: evidence,
    });
  });
  const report = id();
  await withPurpose(tx, "health", (inner) =>
    inner.insert(files).values({
      tenantId,
      id: report,
      purpose: "health_report",
      name: "medical-report.pdf",
      mediaType: "application/pdf",
      sizeBytes: 4096,
      storageKey: `t/${tenantId}/q/${report}`,
    }),
  );

  const providerId = id();
  await tx.insert(identityProviders).values({
    tenantId,
    id: providerId,
    protocol: "oidc",
    displayNameEn: "Google Workspace",
    issuer: "https://accounts.google.com",
    clientId: "client",
    allowedIssuerTenants: ["example.com"],
  });
  await tx
    .insert(identityProviderOrgs)
    .values({ tenantId, identityProviderId: providerId, orgId: schoolId });
  const passkeyId = id();
  await tx.insert(passkeys).values({
    tenantId,
    id: passkeyId,
    accountId: account.id,
    credentialId: bytes(32),
    publicKey: bytes(77),
    uvInitialized: true,
    backupEligible: true,
    backupState: true,
    rpId: "example.com",
  });
  const deviceId = id();
  await tx
    .insert(devices)
    .values({ tenantId, id: deviceId, accountId: account.id, platform: "ios" });
  const now = Date.now();
  await tx.insert(sessions).values({
    tenantId,
    accountId: account.id,
    tokenHash: bytes(32),
    authenticatedAt: new Date(now),
    lastSeenAt: new Date(now),
    idleExpiresAt: new Date(now + 3_600_000),
    absoluteExpiresAt: new Date(now + 86_400_000),
    aal: 1,
    amr: ["pwd"],
    loginIdentityId: identity.id,
    context: "staff",
    clientKind: "ios",
    deviceId,
  });
  await tx.insert(authAttempts).values({
    tenantId,
    keyHash: bytes(32),
    windowEndsAt: new Date(now + 900_000),
  });

  const documentId = id();
  await tx.insert(documents).values({
    tenantId,
    id: documentId,
    hostType: "privacy_notice",
    hostId: id(),
    orgId: schoolId,
    kind: "rich_text",
    schemaVersion: 1,
    locale: "en",
    content: { type: "doc", blocks: [] },
    plainText: "How the school uses personal data.",
  });
  await tx.insert(documentVersions).values({
    tenantId,
    documentId,
    documentVersion: 1,
    reason: "publish",
    content: { type: "doc", blocks: [] },
    plainText: "How the school uses personal data.",
    createdByUserId: userId,
  });
  // The collab role sees only collaborative documents. Without one, its
  // reads touch no row and never reach the tenant check they must fail on.
  await tx.insert(documents).values({
    tenantId,
    hostType: "lesson",
    hostId: id(),
    orgId: schoolId,
    kind: "lesson",
    schemaVersion: 1,
    collaborative: true,
    content: { root: { type: "root", version: 1, children: [] } },
    plainText: "",
  });
  await tx.insert(documentTranslations).values({
    tenantId,
    documentId,
    sourceVersion: 1,
    targetLocale: "ar",
    origin: "machine",
    engine: "fixture",
    content: { type: "doc", blocks: [] },
    plainText: "كيف تستخدم المدرسة البيانات الشخصية.",
  });
  await tx.insert(documentFiles).values({
    tenantId,
    documentId,
    fileId: photoId,
    filePurpose: "site_media",
  });
  await tx.insert(documentLinks).values({
    tenantId,
    documentId,
    targetType: "url",
    href: "https://example.com/policy",
  });
  const noticeId = id();
  await tx.insert(privacyNotices).values({
    tenantId,
    id: noticeId,
    kind: "consent_text",
    purposeDescriptorId: await descriptor(
      tx,
      tenantId,
      "consent_purpose",
      "photo_school_website",
    ),
    orgId: schoolId,
    locale: "en",
    versionLabel: "2026-1",
    documentId,
    publishedAt: new Date(),
  });
  await tx.insert(consentRecords).values({
    tenantId,
    subjectUserId: relationship.student,
    purposeDescriptorId: await descriptor(
      tx,
      tenantId,
      "consent_purpose",
      "photo_school_website",
    ),
    decision: "granted",
    noticeId,
    givenByUserId: userId,
    capacity: "school_on_behalf",
    legalBasis: "consent",
    explicit: true,
    written: true,
    method: "electronic",
    recordedByUserId: userId,
    validDuring: "[2026-09-01,)",
  });

  const erasedSubject = id();
  await tx
    .insert(users)
    .values({ tenantId, id: erasedSubject, fullNameEn: "Held Person" });
  const approvalId = id();
  await tx.insert(erasureApprovals).values({
    tenantId,
    id: approvalId,
    subjectUserId: erasedSubject,
    basis: "data_subject_request",
    approvedByUserId: userId,
  });
  await tx
    .insert(erasureItems)
    .values({ tenantId, approvalId, objectType: "file", objectId: id() });
  await tx.insert(legalHolds).values({
    tenantId,
    subjectUserId: erasedSubject,
    reason: "Open investigation.",
    placedByUserId: userId,
  });

  const importFile = id();
  await tx.insert(files).values({
    tenantId,
    id: importFile,
    purpose: "import_source",
    name: "students.csv",
    mediaType: "text/csv",
    sizeBytes: 512,
    storageKey: `t/${tenantId}/q/${importFile}`,
  });
  const runId = id();
  await tx.insert(importRuns).values({
    tenantId,
    id: runId,
    orgId: schoolId,
    kind: "students",
    mode: "create",
    sourceFileId: importFile,
    startedByUserId: userId,
  });
  await tx
    .insert(importRows)
    .values({ tenantId, importRunId: runId, rowNumber: 1, outcome: "skipped" });
  await tx.insert(userPreferences).values({
    tenantId,
    userId,
    key: "students.view",
    value: { density: "compact" },
  });
  await tx.insert(calendarFeeds).values({
    tenantId,
    userId,
    orgId: schoolId,
    tokenHash: "0".repeat(64),
  });
  const [lesson] = await tx
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.tenantId, tenantId))
    .limit(1);
  if (!lesson) throw new Error("the development seed must run first");
  await tx.insert(lessonResponses).values({
    tenantId,
    lessonId: lesson.id,
    studentUserId: userId,
    blockId: id(),
    try: 1,
    kind: "choice",
    response: { type: "choice", optionIds: [] },
    fraction: 0,
    state: "answered",
  });
  await tx.insert(captionDrafts).values({
    tenantId,
    fileId: importFile,
    language: "en",
    requestedByUserId: userId,
  });
  await tx.insert(lessonCode).values({
    tenantId,
    lessonId: lesson.id,
    studentUserId: userId,
    blockId: "abcd1234",
    code: "print('mine')",
    basedOn: "0".repeat(64),
  });
  await tx.insert(lessonProjects).values({
    tenantId,
    lessonId: lesson.id,
    studentUserId: userId,
    blockId: crypto.randomUUID(),
    files: [{ name: "index.html", code: "<p>mine</p>" }],
    basedOn: "0".repeat(64),
  });
  await tx.insert(lessonShares).values({
    tenantId,
    lessonId: lesson.id,
    studentUserId: userId,
    blockId: crypto.randomUUID(),
    response: {
      type: "project",
      files: [{ name: "index.html", code: "<p>mine</p>" }],
    },
  });
  await tx.insert(lessonRuns).values({
    tenantId,
    lessonId: lesson.id,
    studentUserId: userId,
    blockId: id(),
    attempt: 1,
    code: "print('hi')",
    outcome: "done",
    output: "hi\n",
  });
  await tx.insert(lessonWatches).values({
    tenantId,
    lessonId: lesson.id,
    studentUserId: userId,
    fileId: importFile,
    watched: "{[0,10)}",
    durationSeconds: 60,
    positionSeconds: 10,
  });
  const [setFor] = await tx
    .select({
      moduleId: moduleClasses.moduleId,
      classId: moduleClasses.classId,
    })
    .from(moduleClasses)
    .where(eq(moduleClasses.tenantId, tenantId))
    .limit(1);
  if (!setFor) throw new Error("the development seed sets no module");
  await tx.insert(moduleAudiences).values({
    tenantId,
    moduleId: setFor.moduleId,
    classId: setFor.classId,
    studentUserId: userId,
  });
  await tx.insert(pacedLessons).values({
    tenantId,
    lessonId: lesson.id,
    classId: setFor.classId,
    startedByUserId: userId,
  });
  await tx.insert(lessonReleases).values({
    tenantId,
    lessonId: lesson.id,
    classId: setFor.classId,
    releasedByUserId: userId,
  });
  await tx.insert(lessonOpenings).values({
    tenantId,
    lessonId: lesson.id,
    studentUserId: userId,
    openedByUserId: userId,
  });
  const [snapshot] = await tx
    .select({ id: documentVersions.id })
    .from(documentVersions)
    .where(eq(documentVersions.tenantId, tenantId))
    .limit(1);
  if (!snapshot) throw new Error("the fixture keeps no document version");
  await tx.insert(programRemarks).values({
    tenantId,
    lessonId: lesson.id,
    blockId: id(),
    documentVersionId: snapshot.id,
    requestedByUserId: userId,
  });
  const [submission] = await tx
    .select({
      id: submissions.id,
      studentUserId: submissions.studentUserId,
      assignmentId: submissions.assignmentId,
    })
    .from(submissions)
    .where(eq(submissions.tenantId, tenantId))
    .limit(1);
  if (!submission) throw new Error("the development seed must run first");
  await tx.insert(discussionPosts).values({
    tenantId,
    assignmentId: submission.assignmentId,
    authorUserId: submission.studentUserId,
    content: { root: { type: "root", version: 1, children: [] } },
    plainText: "",
  });
  const [reviewed] = await tx
    .select({
      id: submissionAttempts.id,
      studentUserId: submissionAttempts.studentUserId,
      assignmentId: submissions.assignmentId,
    })
    .from(submissionAttempts)
    .innerJoin(
      submissions,
      and(
        eq(submissions.tenantId, submissionAttempts.tenantId),
        eq(submissions.id, submissionAttempts.submissionId),
      ),
    )
    .where(eq(submissionAttempts.tenantId, tenantId))
    .limit(1);
  if (!reviewed) throw new Error("the development seed hands nothing in");
  await tx.insert(peerReviews).values({
    tenantId,
    assignmentId: reviewed.assignmentId,
    attemptId: reviewed.id,
    authorUserId: reviewed.studentUserId,
    reviewerUserId: userId,
    strengths: "The opening question pulls the reader in.",
    suggestion: "Say where the river starts.",
    sentAt: new Date("2026-09-22T10:00:00Z"),
  });
  const [simulator] = await tx
    .insert(ltiTools)
    .values({
      tenantId,
      orgId: schoolId,
      name: "River simulator",
      clientId: id(),
      deploymentId: id(),
      loginUrl: "https://tool.example.com/login",
      launchUrl: "https://tool.example.com/launch",
      redirectUrls: ["https://tool.example.com/launch"],
      jwksUrl: "https://tool.example.com/jwks",
    })
    .returning({ id: ltiTools.id });
  if (!simulator) throw new Error("no tool");
  const [column] = await tx
    .insert(ltiLineItems)
    .values({
      tenantId,
      toolId: simulator.id,
      moduleId: setFor.moduleId,
      lessonId: lesson.id,
      linkId: id(),
      declared: true,
      label: "Flood simulation",
      scoreMaximum: 10,
    })
    .returning({ id: ltiLineItems.id });
  if (!column) throw new Error("no line item");
  await tx.insert(ltiScores).values({
    tenantId,
    lineItemId: column.id,
    studentUserId: userId,
    scoreGiven: 8,
    scoreMaximum: 10,
    activityProgress: "Completed",
    gradingProgress: "FullyGraded",
    scoredAt: new Date("2026-09-22T10:00:00Z"),
  });
  await tx.insert(ltiKeys).values({
    tenantId,
    orgId: schoolId,
    kid: id(),
    publicJwk: { kty: "RSA", n: "AQAB", e: "AQAB" },
    sealedPrivateJwk: "sealed",
  });
  await tx.insert(ltiReplays).values({
    tenantId,
    keyHash: Buffer.alloc(32),
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  await tx.insert(quizAnswers).values({
    tenantId,
    submissionId: submission.id,
    studentUserId: submission.studentUserId,
    attempt: 1,
    blockId: id(),
    response: { type: "text", text: "Cairo" },
  });
  await tx.insert(accessArrangements).values({
    tenantId,
    orgId: schoolId,
    studentUserId: submission.studentUserId,
    extraTime: 25,
    readAloud: true,
  });
  await tx.insert(quizSittings).values({
    tenantId,
    submissionId: submission.id,
    studentUserId: submission.studentUserId,
    attempt: 1,
    startedAt: new Date("2026-09-20T09:00:00Z"),
    endsAt: new Date("2026-09-20T09:30:00Z"),
  });
  await tx.insert(quizDraws).values({
    tenantId,
    submissionId: submission.id,
    studentUserId: submission.studentUserId,
    attempt: 1,
    drawId: id(),
    position: 0,
    bankQuestionId: id(),
    question: { type: "question", version: 1, kind: "written" },
  });
  await tx.insert(savedViews).values({
    tenantId,
    ownerUserId: userId,
    orgId: schoolId,
    surface: "students",
    name: "Grade 8",
    filter: { grade: "grade_8" },
  });
  const [attempt] = await tx
    .select({
      id: submissionAttempts.id,
      studentUserId: submissionAttempts.studentUserId,
    })
    .from(submissionAttempts)
    .where(eq(submissionAttempts.tenantId, tenantId))
    .limit(1);
  if (!attempt) throw new Error("the development seed hands in no work");
  await tx.insert(familyShares).values({
    tenantId,
    attemptId: attempt.id,
    studentUserId: attempt.studentUserId,
    sharedByUserId: userId,
  });
  await tx.insert(workComments).values({
    tenantId,
    attemptId: attempt.id,
    authorUserId: userId,
    anchor: {
      start: { block: "fixture1", offset: 0 },
      end: { block: "fixture1", offset: 4 },
    },
    body: "Say more here.",
  });
  const [comment] = await tx
    .select({ id: workComments.id })
    .from(workComments)
    .where(eq(workComments.tenantId, tenantId))
    .limit(1);
  if (!comment) throw new Error("work comment fixture missing");
  await tx.insert(workCommentReplies).values({
    tenantId,
    commentId: comment.id,
    authorUserId: userId,
    body: "I see what you mean.",
  });
  await tx.insert(workCommentAnswers).values({
    tenantId,
    commentId: comment.id,
    studentUserId: attempt.studentUserId,
    state: "fixed",
  });
  await tx.insert(bankComments).values({
    tenantId,
    orgId: schoolId,
    ownerUserId: userId,
    body: "Check your spelling.",
    shared: true,
  });
  await tx.insert(documentTemplates).values({
    tenantId,
    orgId: schoolId,
    ownerUserId: userId,
    kind: "lesson",
    title: "Read, check, reflect",
  });
  const [framework] = await tx
    .insert(standardFrameworks)
    .values({ tenantId, orgId: schoolId, title: "Reading" })
    .returning();
  if (!framework) throw new Error("framework not inserted");
  const [standard] = await tx
    .insert(standards)
    .values({
      tenantId,
      frameworkId: framework.id,
      code: "R.1",
      statement: "Read a story aloud with expression.",
      position: 0,
    })
    .returning();
  if (!standard) throw new Error("standard not inserted");
  await tx.insert(standardEvidence).values({
    tenantId,
    studentUserId: submission.studentUserId,
    standardId: standard.id,
    source: "quiz",
    submissionId: submission.id,
    attempt: 1,
    blockId: id(),
    fraction: 0.75,
    answeredAt: new Date("2026-09-20T09:20:00Z"),
  });
  await tx.insert(goalJudgements).values({
    tenantId,
    studentUserId: submission.studentUserId,
    standardId: standard.id,
    level: "expected",
    note: "Retold the story in order with the pictures.",
    judgedByUserId: userId,
    judgedAt: new Date("2026-09-21T10:00:00Z"),
  });
  await tx.insert(standardObservations).values({
    tenantId,
    studentUserId: submission.studentUserId,
    standardId: standard.id,
    level: "developing",
    note: "Explained the water cycle to the group.",
    observedByUserId: userId,
    observedAt: new Date("2026-09-22T10:00:00Z"),
  });
  await tx.insert(bankQuestions).values({
    tenantId,
    orgId: schoolId,
    ownerUserId: userId,
    scope: "school",
    kind: "choice",
    title: "Which is a noun?",
    tags: ["nouns"],
  });
  await tx.insert(sharedBlocks).values({
    tenantId,
    orgId: schoolId,
    ownerUserId: userId,
    scope: "school",
    title: "Lab safety rules",
  });
  const [scale] = await tx
    .insert(gradeScales)
    .values({ tenantId, orgId: schoolId, titleEn: "Letters", display: "grade" })
    .returning();
  if (!scale) throw new Error("grade scale fixture missing");
  await tx.insert(gradeScaleVersions).values({
    tenantId,
    scaleId: scale.id,
    effectiveFrom: "2026-09-01",
    bands: [
      { labelEn: "A", labelAr: "A", minPercent: 50, gpa: null },
      { labelEn: "F", labelAr: "F", minPercent: 0, gpa: null },
    ],
    createdByUserId: userId,
  });
  const [programme] = await tx
    .insert(programmes)
    .values({
      tenantId,
      orgId: schoolId,
      titleEn: "Middle years",
      gradeScaleId: scale.id,
    })
    .returning();
  if (!programme) throw new Error("programme fixture missing");
  await tx.insert(retentionSettings).values({
    tenantId,
    orgId: schoolId,
    studentRule: "until_age",
    studentValue: 25,
    staffYears: 6,
  });
  await tx.insert(breaches).values({
    tenantId,
    orgId: schoolId,
    title: "Report sent to the wrong family",
    description: "A term report reached another family.",
    discoveredAt: new Date("2026-09-10T08:00:00Z"),
    law: "egypt",
    risk: "risk",
    loggedByUserId: userId,
  });
  await tx.insert(recordsRequests).values({
    tenantId,
    orgId: schoolId,
    subjectUserId: userId,
    requestedBy: "Salama Ashoush",
    relation: "self",
    kind: "access",
    law: "uk_gdpr",
    receivedOn: "2026-09-01",
    clockFrom: "2026-09-01",
    dueOn: "2026-10-01",
    loggedByUserId: userId,
  });
  const [askedFor] = await tx
    .insert(recordsRequests)
    .values({
      tenantId,
      orgId: schoolId,
      subjectUserId: relationship.student,
      requestedBy: "Salama Ashoush",
      relation: "parent",
      kind: "correction",
      law: "egypt",
      receivedOn: "2026-09-01",
      clockFrom: "2026-09-01",
      dueOn: "2026-10-01",
      loggedByUserId: relationship.related,
      topic: "health",
    })
    .returning({ id: recordsRequests.id });
  if (!askedFor) throw new Error("health change request fixture missing");
  const [healthKey] = await tx.execute<{ key_version: number }>(sql`
    select key_version from core.tenant_keys where tenant_id = ${tenantId}::uuid and purpose = 'health' limit 1`);
  if (!healthKey) throw new Error("the seed gives every tenant a health key");
  const allergy = await descriptor(
    tx,
    tenantId,
    "health_record_kind",
    "allergy",
  );
  await withPurpose(tx, "health", (inner) =>
    inner.insert(healthChanges).values({
      tenantId,
      requestId: askedFor.id,
      studentUserId: relationship.student,
      requestedByUserId: relationship.related,
      target: "record",
      kindDescriptorId: allergy,
      keyVersion: healthKey.key_version,
      ciphertext: bytes(64),
    }),
  );
  await tx.insert(programmeCategories).values({
    tenantId,
    programmeId: programme.id,
    titleEn: "Coursework",
    weight: 100,
  });
  await tx.insert(programmeGradeLevels).values({
    tenantId,
    programmeId: programme.id,
    gradeLevelDescriptorId: await descriptor(
      tx,
      tenantId,
      "grade_level",
      "grade_8",
    ),
  });
  const [examBoard] = await tx
    .insert(examBoards)
    .values({ tenantId, orgId: schoolId, titleEn: "Mocks" })
    .returning();
  const [examSession] = await tx
    .insert(examSessions)
    .values({
      tenantId,
      orgId: schoolId,
      boardId: examBoard?.id,
      titleEn: "Year 11 mocks",
      sitsIn: "2027-01-01",
      keepUntil: "2027-07-31",
    })
    .returning();
  const [handedIn] = await tx
    .select({ assignmentId: submissions.assignmentId })
    .from(submissions)
    .where(
      and(
        eq(submissions.tenantId, tenantId),
        eq(submissions.studentUserId, attempt.studentUserId),
      ),
    )
    .limit(1);
  if (!examSession || !handedIn) throw new Error("exam fixture rows missing");
  await tx.insert(courseworkAssessments).values({
    tenantId,
    assignmentId: handedIn.assignmentId,
    sessionId: examSession.id,
    setByUserId: userId,
  });
  await tx.insert(attemptDeclarations).values({
    tenantId,
    attemptId: attempt.id,
    studentUserId: attempt.studentUserId,
    kind: "student",
    statement: "2026-10",
    aiUsed: false,
    recordedByUserId: attempt.studentUserId,
  });
  await tx.insert(attemptAuthentications).values({
    tenantId,
    attemptId: attempt.id,
    outcome: "confirmed",
    teacherUserId: userId,
  });

  const [lessonSlot] = await tx.execute<{
    class_id: string;
    class_period_id: string;
    school_year_id: string;
  }>(sql`
    select class_id, class_period_id, school_year_id from core.class_meetings
    where tenant_id = ${tenantId}::uuid and org_id = ${schoolId}::uuid and status = 'active'
    limit 1`);
  if (!lessonSlot) throw new Error("the development seed plans no lessons");
  const illness = await descriptor(
    tx,
    tenantId,
    "attendance_reason",
    "illness",
  );
  await tx.insert(staffAbsences).values({
    tenantId,
    orgId: schoolId,
    schoolYearId: lessonSlot.school_year_id,
    userId,
    span: "[2026-11-02,2026-11-03)",
    reason: "training",
  });
  await tx.insert(lessonChanges).values({
    tenantId,
    orgId: schoolId,
    schoolYearId: lessonSlot.school_year_id,
    classId: lessonSlot.class_id,
    classPeriodId: lessonSlot.class_period_id,
    dayOn: "2026-11-02",
    cancelled: true,
  });
  await tx.insert(absenceReports).values({
    tenantId,
    orgId: schoolId,
    schoolYearId: lessonSlot.school_year_id,
    studentUserId: relationship.student,
    reportedByUserId: userId,
    kind: "absent",
    span: "[2026-11-02,2026-11-03)",
    reasonDescriptorId: illness,
  });
  await tx.insert(attendanceContacts).values({
    tenantId,
    orgId: schoolId,
    studentUserId: relationship.student,
    dayOn: "2026-11-02",
    outcome: "no_answer",
    recordedByUserId: userId,
  });
  await tx.insert(studentMovements).values({
    tenantId,
    orgId: schoolId,
    studentUserId: relationship.student,
    dayOn: "2026-11-02",
    direction: "in",
    at: "09:10",
    recordedByUserId: userId,
  });

  const eventId = await writeAudit(tx, tenantId, {
    action: "user.update",
    objectType: "user",
    objectId: userId,
    subjectUserId: userId,
    change: {
      table: "core.users",
      before: { preferredGivenName: null },
      after: { preferredGivenName: "Sal" },
    },
  });
  await tx.insert(sealBatches).values({
    tenantId,
    batchNo: 1,
    eventCount: 1,
    root: bytes(32),
    hash: bytes(32),
  });
  const [logged] = await tx.execute<{ occurred_at: string }>(
    sql`select occurred_at::text as occurred_at from audit.log where tenant_id = ${tenantId}::uuid and id = ${eventId}::uuid`,
  );
  await tx.insert(sealMembers).values({
    tenantId,
    eventId,
    eventOccurredAt: new Date(logged?.occurred_at ?? Date.now()),
    batchNo: 1,
  });
  await tx.insert(anchors).values({
    tenantId,
    batchNo: 1,
    objectKey: `anchors/${tenantId}/1`,
    objectVersionId: "v1",
  });
  const [current] = await tx
    .select({ id: academicSessions.id })
    .from(academicSessions)
    .where(
      and(
        eq(academicSessions.tenantId, tenantId),
        eq(academicSessions.orgId, schoolId),
        eq(academicSessions.type, "school_year"),
      ),
    )
    .limit(1);
  if (!current) throw new Error("the development seed must run first");
  const nextYear = id();
  await tx.insert(academicSessions).values({
    tenantId,
    id: nextYear,
    orgId: schoolId,
    type: "school_year",
    schoolYearId: nextYear,
    titleEn: "Fixture year",
    span: "[2035-09-01,2036-07-01)",
    schoolYear: 2036,
    lifecycle: "upcoming",
  });
  const admissionForm = await insertAdmissionForm(tx, {
    tenantId,
    orgId: schoolId,
    nameEn: "Fixture form",
    nameAr: "",
    questions: [],
  });
  const admissionVersion = await publishAdmissionForm(tx, {
    tenantId,
    orgId: schoolId,
    id: admissionForm.id,
    expectedVersion: admissionForm.version,
    userId,
  });
  if (!admissionVersion) throw new Error("fixture form was not published");
  const intake = await insertIntake(tx, {
    tenantId,
    orgId: schoolId,
    schoolYearId: nextYear,
    gradeId: await descriptor(tx, tenantId, "grade_level", "kg1"),
    opensOn: "2035-01-01",
    closesOn: "2035-03-31",
    capacity: 20,
    formId: admissionForm.id,
    checklist: [],
    currency: "EGP",
    fees: [],
    decisionsOn: null,
    offerDays: 14,
    ageCutoffOn: "2035-10-01",
    minAgeMonths: 48,
    maxAgeMonths: 71,
    priorities: ["sibling"],
  });
  const admission = await insertApplication(tx, {
    tenantId,
    orgId: schoolId,
    intakeId: intake.id,
    formVersionId: admissionVersion.id,
    familyUserId: userId,
    applicantUserId: relationship.student,
    locale: "en",
    form: emptyApplicationForm(),
    checklist: [
      {
        key: id(),
        kind: "document",
        labelEn: "Birth certificate",
        labelAr: "",
        required: true,
      },
    ],
  });
  await insertApplicationEntry(tx, {
    tenantId,
    orgId: schoolId,
    applicationId: admission.id,
    kind: "note",
    body: "Fixture note.",
    authorUserId: userId,
  });
  await insertLetter(tx, {
    tenantId,
    orgId: schoolId,
    applicationId: admission.id,
    kind: "waitlist",
    locale: "en",
    title: "A place on our waiting list",
    templateId: null,
    sentByUserId: userId,
  });
  await insertEvent(tx, {
    tenantId,
    orgId: schoolId,
    applicationId: admission.id,
    itemId: null,
    kind: "tour",
    startsOn: "2035-02-01",
    startTime: "09:00",
    endTime: "09:45",
    location: "Main gate",
    attendeeIds: [userId],
  });
  await tx.insert(attendanceSettings).values({
    tenantId,
    orgId: schoolId,
    teacherEditDays: 7,
    noticeDelayMinutes: 30,
    chronicPercent: 10,
  });
  await tx.insert(yearRollovers).values({
    tenantId,
    orgId: schoolId,
    sourceYearId: current.id,
    targetYearId: nextYear,
    plan: { classes: [], students: [] },
  });
  // What a release before conversations wrote: an enquiry with a thread of
  // its own, which the move into Messages turns into a conversation.
  const legacyEnquiry = id();
  await tx.insert(siteEnquiries).values({
    tenantId,
    id: legacyEnquiry,
    orgId: schoolId,
    source: "phone",
    locale: "en",
    purpose: "visit",
    name: "Salama Ashoush",
    email: "Salama.Legacy@Example.com",
    phone: "0100 555 0177",
    message: "Asked about a visit.",
    state: "in_progress",
    assigneeUserId: userId,
    createdByUserId: userId,
  });
  await tx.insert(siteEnquiryEntries).values([
    {
      tenantId,
      orgId: schoolId,
      enquiryId: legacyEnquiry,
      kind: "note",
      body: "Prefers mornings.",
      authorUserId: userId,
    },
    {
      tenantId,
      orgId: schoolId,
      enquiryId: legacyEnquiry,
      kind: "reply",
      body: "Dear Salama, Tuesday at ten suits us.",
      details: { subject: "Visiting", locale: "en" },
      authorUserId: userId,
    },
    {
      tenantId,
      orgId: schoolId,
      enquiryId: legacyEnquiry,
      kind: "state",
      details: { from: "open", to: "in_progress", automatic: true },
      authorUserId: userId,
    },
  ]);
  await tx.insert(messageDrafts).values({
    tenantId,
    orgId: schoolId,
    userId,
    kind: "direct",
    body: "Salama, a note still being written.",
  });
  const [builtin] = await tx
    .select({ id: accessRoles.id })
    .from(accessRoles)
    .where(eq(accessRoles.tenantId, tenantId))
    .limit(1);
  return {
    documentId,
    noticeId,
    builtinRoleId: builtin?.id,
    photoId,
    erasedSubject,
    legacyEnquiry,
  };
}
