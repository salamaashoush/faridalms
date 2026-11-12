import { writeAudit } from "@faridalms/database/audit";
import { mailboxConversationWith } from "@faridalms/database/stores/enquiries";
import { publicSchool } from "@faridalms/database/stores/public-school";
import { applicationSubject } from "@faridalms/domain/enquiries";

import type { ConversationScope } from "../messages/conversations";

import { openMailboxConversation, writeEntry } from "../messages/conversations";
import { registerLetterDelivery } from "./decisions";

/**
 * The filer's conversation with admissions: the one their enquiry brought
 * or the newest they are in, started now when they have none, with the
 * filer in it under a subject in their language.
 */
export async function filerThread(
  scope: ConversationScope,
  row: {
    id: string;
    filedByUserId: string;
    enquiryId: string | null;
    locale: "en" | "ar";
  },
): Promise<string> {
  const existing = await mailboxConversationWith(scope.tx, {
    tenantId: scope.tenantId,
    schoolId: scope.schoolId,
    mailbox: "admissions",
    userId: row.filedByUserId,
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
    memberIds: [row.filedByUserId],
  });
  await writeAudit(scope.tx, scope.tenantId, {
    action: "message_thread.create",
    objectType: "message_thread",
    objectId: threadId,
    orgId: scope.schoolId,
    subjectUserId: row.filedByUserId,
    details: { mailbox: "admissions", application: row.id },
  });
  return threadId;
}

// Each letter is also a message in the filer's conversation with
// admissions, so what the school wrote sits with everything else said and
// reaches them by email the way every message does. The filer's notice
// about the move already tells them, so the message adds no second one.
registerLetterDelivery(async (scope, letter) => {
  if (!letter.sentByUserId) return;
  const threadId = await filerThread(scope, {
    id: letter.applicationId,
    filedByUserId: letter.filedByUserId,
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
