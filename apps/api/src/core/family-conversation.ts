import { writeAudit } from "@faridalms/database/audit";
import { familyConversation } from "@faridalms/database/stores/messages";
import { publicSchool } from "@faridalms/database/stores/site";
import { applicationSubject } from "@faridalms/domain/enquiries";

import type { ConversationScope } from "../messages/conversations";

import { openMailboxConversation, writeEntry } from "../messages/conversations";
import { registerLetterDelivery } from "./decisions";

/**
 * An applying family's conversation with admissions: the one their
 * enquiry brought or the newest they are in, started now when they have
 * none, with the family in it under a subject in their language.
 */
export async function familyThread(
  scope: ConversationScope,
  row: {
    id: string;
    familyUserId: string;
    enquiryId: string | null;
    locale: "en" | "ar";
  },
): Promise<string> {
  const existing = await familyConversation(scope.tx, {
    tenantId: scope.tenantId,
    schoolId: scope.schoolId,
    mailbox: "admissions",
    userId: row.familyUserId,
    enquiryId: row.enquiryId,
  });
  if (existing) return existing;
  const school = await publicSchool(scope.tx, scope.schoolId);
  const threadId = await openMailboxConversation(scope, {
    mailbox: "admissions",
    subject: applicationSubject(
      row.locale,
      (row.locale === "ar" ? school?.nameAr : null) ?? school?.nameEn ?? "",
    ),
    ownerId: null,
    memberIds: [row.familyUserId],
  });
  await writeAudit(scope.tx, scope.tenantId, {
    action: "message_thread.create",
    objectType: "message_thread",
    objectId: threadId,
    orgId: scope.schoolId,
    subjectUserId: row.familyUserId,
    details: { mailbox: "admissions", application: row.id },
  });
  return threadId;
}

// Each letter is also a message in the family's conversation with
// admissions, so what the school wrote sits with everything else said and
// reaches them by email the way every message does. The family's notice
// about the move already tells them, so the message adds no second one.
registerLetterDelivery(async (scope, letter) => {
  if (!letter.sentByUserId) return;
  const threadId = await familyThread(scope, {
    id: letter.applicationId,
    familyUserId: letter.familyUserId,
    enquiryId: letter.enquiryId,
    locale: letter.applicationLocale,
  });
  await writeEntry(scope, {
    threadId,
    kind: "message",
    authorUserId: letter.sentByUserId,
    content: letter.content,
    details: { letterId: letter.id, applicationId: letter.applicationId },
    notify: false,
  });
});
