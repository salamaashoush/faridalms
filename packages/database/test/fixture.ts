import { emptyApplicationForm } from "@faridalms/domain/admissions";
import { formDocument } from "@faridalms/domain/questions";
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
import { setIntakeGrade } from "../src/stores/intake-grades";
import { setIntakeYear } from "../src/stores/intake-years";
import { setOrgFeature } from "../src/stores/school";
import {
  absenceReports,
  academicSessions,
  accessRoles,
  attendanceSettings,
  bellSchedules,
  siteEnquiries,
  messageDrafts,
  accounts,
  calendarFeeds,
  consentGuardians,
  consentRecords,
  contactChanges,
  descriptorOverrides,
  descriptors,
  devices,
  emergencyContacts,
  documentFiles,
  documentLinks,
  documentTemplates,
  bankQuestions,
  sharedBlocks,
  standardFrameworks,
  standardEvidence,
  standardSittings,
  standards,
  workSittings,
  lessonSittings,
  classGrading,
  classLessonSettings,
  moduleDiscussions,
  assignments,
  classes,
  goalJudgements,
  goalReports,
  healthChanges,
  standardObservations,
  gradeScales,
  readingNorms,
  gradeScaleVersions,
  programmeCategories,
  breaches,
  recordsRequests,
  retentionSettings,
  programmeGradeLevels,
  programmes,
  broadcastGrades,
  calendarEventGrades,
  familyShares,
  lessonChanges,
  staffAbsences,
  timetableDays,
  studentMovements,
  workComments,
  documentThreads,
  documentComments,
  workCommentReplies,
  workCommentAnswers,
  bankComments,
  captionDrafts,
  filePreviews,
  submissionAttempts,
  documentTranslations,
  documentHolds,
  documents,
  documentVersions,
  erasureApprovals,
  erasureItems,
  filePublications,
  fileSubjects,
  files,
  identityProviderOrgs,
  mediaFolders,
  mediaItemTags,
  mediaItemTexts,
  mediaTags,
  siteRedirects,
  identityProviders,
  federatedIdentities,
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
  discussionLikes,
  discussionPosts,
  assistantSettings,
  assistantRequests,
  peerReviewComments,
  peerReviewSettings,
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
  studentDepartures,
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
  if (!someone || !account || !identity || !relationship)
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

  await tx.execute(sql`
    insert into core.grade_level_settings (tenant_id, org_id, term)
    values (${tenantId}::uuid, ${schoolId}::uuid, 'level')
    on conflict do nothing`);
  await tx.execute(sql`
    insert into core.gradebook_settings (tenant_id, org_id, running_shown)
    values (${tenantId}::uuid, ${schoolId}::uuid, false)
    on conflict do nothing`);
  await tx.execute(sql`
    insert into core.class_running_grades (tenant_id, org_id, class_id, shown)
    select c.tenant_id, c.org_id, c.id, false from core.classes c
    where c.tenant_id = ${tenantId}::uuid and c.org_id = ${schoolId}::uuid
      and c.status = 'active'
      and not exists (select 1 from core.class_running_grades g
        where g.tenant_id = c.tenant_id and g.class_id = c.id and g.status = 'active')
    limit 1`);

  await tx.execute(sql`
    insert into core.young_classes (tenant_id, org_id, class_id)
    select c.tenant_id, c.org_id, c.id from core.classes c
    where c.tenant_id = ${tenantId}::uuid and c.org_id = ${schoolId}::uuid
      and c.status = 'active'
      and not exists (select 1 from core.young_classes y
        where y.tenant_id = c.tenant_id and y.class_id = c.id and y.status = 'active')
    limit 1`);

  await tx.insert(emergencyContacts).values({
    tenantId,
    userId,
    name: "Huda Saleh",
    relationship: "Sister",
    phone: "+201000000077",
    callOrder: 1,
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
  await tx.insert(filePreviews).values({
    tenantId,
    storageKey: `t/${tenantId}/f/${photoId}`,
    kind: "picture",
    mediaType: "image/jpeg",
  });

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
  const [federated] = await tx
    .insert(loginIdentities)
    .values({
      tenantId,
      accountId: account.id,
      kind: "oidc",
      linkMethod: "verified_domain",
    })
    .returning({ id: loginIdentities.id });
  if (!federated) throw new Error("no federated sign-in");
  await tx.insert(federatedIdentities).values({
    tenantId,
    loginIdentityId: federated.id,
    identityProviderId: providerId,
    subject: `subject-${tenantId}`,
  });
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
  await tx.insert(documentHolds).values({
    tenantId,
    hostType: "news_post",
    hostId: id(),
    userId,
    heldSince: new Date(now),
    expiresAt: new Date(now + 90_000),
  });
  await tx.insert(mediaFolders).values({
    tenantId,
    orgId: schoolId,
    name: "Sports day",
  });
  const sportsTag = id();
  await tx.insert(mediaTags).values({
    tenantId,
    id: sportsTag,
    orgId: schoolId,
    name: "Sports",
  });
  await tx.insert(mediaItemTags).values({
    tenantId,
    fileId: photoId,
    tagId: sportsTag,
    taggedByUserId: userId,
  });
  await tx.insert(mediaItemTexts).values({
    tenantId,
    fileId: photoId,
    title: "Sports day relay",
    caption: "The year 7 relay team at the finish.",
  });
  await tx.insert(siteRedirects).values({
    tenantId,
    orgId: schoolId,
    fromPath: "/old-admissions",
    toUrl: "https://example.com/admissions",
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
  const [consent] = await tx
    .insert(consentRecords)
    .values({
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
    })
    .returning({ id: consentRecords.id });
  if (!consent) throw new Error("consent fixture missing");
  await tx.insert(consentGuardians).values({
    tenantId,
    consentRecordId: consent.id,
    relationshipId: relationship.id,
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
  const [post] = await tx
    .insert(discussionPosts)
    .values({
      tenantId,
      assignmentId: submission.assignmentId,
      authorUserId: submission.studentUserId,
      content: { root: { type: "root", version: 1, children: [] } },
      plainText: "",
    })
    .returning({ id: discussionPosts.id });
  if (!post) throw new Error("no discussion post");
  await tx.insert(discussionLikes).values({
    tenantId,
    postId: post.id,
    userId,
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
  await tx
    .insert(peerReviewSettings)
    .values({
      tenantId,
      assignmentId: reviewed.assignmentId,
      reviews: 1,
      anonymous: true,
      startedAt: new Date("2026-09-20T10:00:00Z"),
    })
    .onConflictDoNothing();
  const [review] = await tx
    .insert(peerReviews)
    .values({
      tenantId,
      assignmentId: reviewed.assignmentId,
      attemptId: reviewed.id,
      authorUserId: reviewed.studentUserId,
      reviewerUserId: userId,
      strengths: "The opening question pulls the reader in.",
      suggestion: "Say where the river starts.",
      sentAt: new Date("2026-09-22T10:00:00Z"),
      helpfulness: "very",
    })
    .returning({ id: peerReviews.id });
  if (!review) throw new Error("no peer review");
  await tx.insert(peerReviewComments).values({
    tenantId,
    reviewId: review.id,
    anchor: {
      start: { block: "b1", offset: 0 },
      end: { block: "b1", offset: 5 },
    },
    body: "This line made me want to read on.",
  });
  await tx.insert(assistantSettings).values({
    tenantId,
    orgId: schoolId,
    enabled: true,
    provider: "anthropic",
    dailyLimit: 50,
  });
  await tx.insert(assistantRequests).values({
    tenantId,
    orgId: schoolId,
    userId,
    task: "translate",
    hostType: "lesson",
    hostId: lesson.id,
    provider: "anthropic",
    model: "claude-opus-5-5",
    day: "2026-09-22",
    sentCharacters: 1200,
    receivedCharacters: 1300,
    inputTokens: 600,
    outputTokens: 700,
    outcome: "done",
    finishedAt: new Date("2026-09-22T10:00:00Z"),
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
  const threadId = id();
  await tx.insert(documentThreads).values({
    tenantId,
    id: threadId,
    documentId,
    anchor: {
      start: { block: "fixture1", offset: 0 },
      end: { block: "fixture1", offset: 4 },
    },
    quote: "How",
    authorUserId: userId,
  });
  await tx.insert(documentComments).values({
    tenantId,
    threadId,
    authorUserId: userId,
    body: "Is this the latest wording?",
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
  const [sitting] = await tx
    .insert(standardSittings)
    .values({ tenantId, studentUserId: submission.studentUserId, kind: "work" })
    .returning();
  if (!sitting) throw new Error("sitting not inserted");
  await tx.insert(workSittings).values({
    tenantId,
    sittingId: sitting.id,
    studentUserId: submission.studentUserId,
    submissionId: submission.id,
  });
  const [lessonSitting] = await tx
    .insert(standardSittings)
    .values({ tenantId, studentUserId: userId, kind: "lesson" })
    .returning();
  if (!lessonSitting) throw new Error("lesson sitting not inserted");
  await tx.insert(lessonSittings).values({
    tenantId,
    sittingId: lessonSitting.id,
    studentUserId: userId,
    lessonId: lesson.id,
  });
  await tx.insert(standardEvidence).values({
    tenantId,
    studentUserId: submission.studentUserId,
    standardId: standard.id,
    source: "quiz",
    sittingId: sitting.id,
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
    sittingId: sitting.id,
    blockId: id(),
    judgedByUserId: userId,
    judgedAt: new Date("2026-09-21T10:00:00Z"),
  });
  await tx.insert(goalReports).values({
    tenantId,
    studentUserId: submission.studentUserId,
    frameworkId: framework.id,
    sharedByUserId: userId,
    sharedAt: new Date("2026-09-23T15:00:00Z"),
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
  await tx.insert(readingNorms).values({
    tenantId,
    orgId: schoolId,
    language: "ar",
    rows: [
      {
        grade: "grade_2",
        season: "spring",
        p10: 30,
        p25: 45,
        p50: 60,
        p75: 75,
        p90: 90,
      },
    ],
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
  const [taught] = await tx
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.tenantId, tenantId), eq(classes.orgId, schoolId)))
    .limit(1);
  if (!taught) throw new Error("the development seed must run first");
  await tx.insert(classGrading).values({
    tenantId,
    orgId: schoolId,
    classId: taught.id,
    programmeId: programme.id,
  });
  await tx.insert(classLessonSettings).values({
    tenantId,
    orgId: schoolId,
    classId: taught.id,
    lessonSounds: false,
  });
  const [discussion] = await tx
    .insert(assignments)
    .values({
      tenantId,
      orgId: schoolId,
      classId: taught.id,
      authorUserId: userId,
      title: "Which river would you visit?",
      submissionFormat: "discussion",
      discussionPostFirst: false,
      discussionReplies: 0,
    })
    .returning({ id: assignments.id });
  if (!discussion) throw new Error("discussion fixture missing");
  await tx.insert(moduleDiscussions).values({
    tenantId,
    assignmentId: discussion.id,
    classId: taught.id,
    moduleId: setFor.moduleId,
    discussionGroup: discussion.id,
  });
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
  const [contactAsked] = await tx
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
  if (!contactAsked) throw new Error("contact change request fixture missing");
  await withPurpose(tx, "health", async (inner) => {
    const [change] = await inner
      .insert(healthChanges)
      .values({
        tenantId,
        requestId: contactAsked.id,
        studentUserId: relationship.student,
        requestedByUserId: relationship.related,
        target: "contact",
        keyVersion: healthKey.key_version,
        ciphertext: bytes(64),
      })
      .returning({ id: healthChanges.id });
    if (!change) throw new Error("contact change fixture missing");
    await inner.insert(contactChanges).values({
      tenantId,
      changeId: change.id,
      relationshipId: relationship.id,
    });
  });
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
  const grade8 = await descriptor(tx, tenantId, "grade_level", "grade_8");
  const [broadcast] = await tx.execute<{ id: string }>(sql`
    select id from core.broadcasts where tenant_id = ${tenantId}::uuid limit 1`);
  const [calendarEvent] = await tx.execute<{ id: string }>(sql`
    select id from core.calendar_events where tenant_id = ${tenantId}::uuid limit 1`);
  if (!broadcast || !calendarEvent)
    throw new Error("the development seed must hold a broadcast and an event");
  await tx.insert(broadcastGrades).values({
    tenantId,
    broadcastId: broadcast.id,
    gradeLevelDescriptorId: grade8,
  });
  await tx.insert(calendarEventGrades).values({
    tenantId,
    eventId: calendarEvent.id,
    gradeLevelDescriptorId: grade8,
  });
  await tx.execute(sql`
    insert into core.broadcast_families (tenant_id, broadcast_id)
    values (${tenantId}::uuid, ${broadcast.id}::uuid) on conflict do nothing`);
  await tx.execute(sql`
    insert into core.site_posts (tenant_id, org_id, broadcast_id, slug)
    select b.tenant_id, b.org_id, b.id, 'fixture-' || left(b.id::text, 8)
    from core.broadcasts b
    where b.tenant_id = ${tenantId}::uuid and b.id = ${broadcast.id}::uuid
      and not exists (select 1 from core.site_posts p
        where p.tenant_id = b.tenant_id and p.broadcast_id = b.id and p.status = 'active')`);
  await tx.execute(sql`
    insert into core.module_templates (tenant_id, template_id, module_id)
    select t.tenant_id, t.id, m.id from core.document_templates t
    join core.learning_modules m on m.tenant_id = t.tenant_id and m.status = 'active'
    where t.tenant_id = ${tenantId}::uuid and t.status = 'active'
      and not exists (select 1 from core.module_templates x
        where x.tenant_id = t.tenant_id and x.status = 'active')
    limit 1`);
  await tx.execute(sql`
    insert into core.calendar_event_families (tenant_id, event_id)
    values (${tenantId}::uuid, ${calendarEvent.id}::uuid) on conflict do nothing`);
  const [lessonSlot] = await tx.execute<{
    class_id: string;
    class_period_id: string;
  }>(sql`
    select class_id, class_period_id from core.class_meetings
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
    userId,
    span: "[2026-11-02,2026-11-03)",
    reason: "training",
  });
  await tx.insert(lessonChanges).values({
    tenantId,
    orgId: schoolId,
    classId: lessonSlot.class_id,
    classPeriodId: lessonSlot.class_period_id,
    dayOn: "2026-11-02",
    cancelled: true,
  });
  const [schedule] = await tx
    .insert(bellSchedules)
    .values({
      tenantId,
      orgId: schoolId,
      nameEn: "Late start",
      times: [{ code: "1", startTime: "09:00", endTime: "09:45" }],
    })
    .returning({ id: bellSchedules.id });
  if (!schedule) throw new Error("bell schedule not written");
  await tx.insert(timetableDays).values({
    tenantId,
    orgId: schoolId,
    dayOn: "2026-11-02",
    bellScheduleId: schedule.id,
  });
  await tx.insert(absenceReports).values({
    tenantId,
    orgId: schoolId,
    studentUserId: relationship.student,
    reportedByUserId: userId,
    kind: "absent",
    span: "[2026-11-02,2026-11-03)",
    reasonDescriptorId: illness,
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
    primaryLocale: "en",
    body: formDocument([]),
    translation: null,
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
    titleEn: "KG1, 2035",
    titleAr: null,
    startsOn: "2035-09-01",
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
    letters: {},
  });
  await setIntakeYear(tx, {
    tenantId,
    orgId: schoolId,
    intakeId: intake.id,
    yearId: nextYear,
  });
  await setIntakeGrade(tx, {
    tenantId,
    intakeId: intake.id,
    gradeId: await descriptor(tx, tenantId, "grade_level", "kg1"),
  });
  const admission = await insertApplication(tx, {
    tenantId,
    orgId: schoolId,
    intakeId: intake.id,
    formVersionId: admissionVersion.id,
    filedByUserId: userId,
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
  // A departure taken back, so it reads as history and no student here has left.
  await tx.insert(studentDepartures).values({
    tenantId,
    orgId: schoolId,
    studentUserId: relationship.student,
    leftOn: "2026-10-01",
    accessEndsOn: "2026-10-01",
    ended: { role: null, enrollments: [], dropped: [], groups: [], parts: {} },
    status: "tobedeleted",
  });
  // An enquiry staff logged by phone, not yet given its conversation.
  const loggedEnquiry = id();
  await tx.insert(siteEnquiries).values({
    tenantId,
    id: loggedEnquiry,
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
    loggedEnquiry,
  };
}
