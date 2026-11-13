import {
  contactChangesOf,
  guardianSummary,
  keepContactChange,
} from "@faridalms/database/stores/guardian-health";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { noticeLines } from "../notifications/points";
import { learnersActedFor } from "../people/acting";
import { contactChanges, summaryReaders } from "./points";

/**
 * The medical summary as guardians read it: a guardian whose link permits
 * it reads the summary of a learner they follow and may ask for changes,
 * a guardian's phone among them when the guardian is an emergency contact.
 */
export const STUDENT_RECORDS_WITH_FAMILIES: ModuleContributions = {
  module: "student_records",
  needs: ["families"],
  contributions: [
    contribute(noticeLines, {
      kind: "correction",
      en: (p) =>
        p.report === "accepted"
          ? `The school updated ${p.studentName ?? "your child"}'s medical summary with the change you asked for.`
          : `The school answered the change you asked for in ${p.studentName ?? "your child"}'s medical summary and did not make it.`,
      ar: (p) =>
        p.report === "accepted"
          ? `حدّثت المدرسة ملخص ${p.studentName ?? "طفلك"} الطبي بالتعديل الذي طلبته.`
          : `لم تعتمد المدرسة التعديل الذي طلبته على ملخص ${p.studentName ?? "طفلك"} الطبي.`,
    }),
    contribute(summaryReaders, {
      readerOf: async (context, studentId) => {
        const follows = await learnersActedFor(context, {
          userId: context.actor.userId,
          on: context.today,
          purpose: "health",
        });
        return follows.some((link) => link.studentId === studentId)
          ? guardianSummary({
              tenantId: context.tenantId,
              viewerId: context.actor.userId,
              today: context.today,
            })
          : null;
      },
    }),
    contribute(contactChanges, {
      keepChange: (context, tx, input) =>
        keepContactChange(tx, {
          tenantId: context.tenantId,
          changeId: input.changeId,
          relationshipId: input.contactId,
        }),
      changesOf: (context, tx, changeIds) =>
        contactChangesOf(tx, { tenantId: context.tenantId, changeIds }),
    }),
  ],
};
