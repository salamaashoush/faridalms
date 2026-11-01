import type { ApplicationRow } from "@faridalms/database/stores/admissions";
import type { ApplicationConsent } from "@faridalms/domain/admissions";
import type { ContentDocument } from "@faridalms/domain/content";

import {
  insertApplicationEntry,
  intakesOf,
  itemsOf,
  setItemState,
} from "@faridalms/database/stores/admissions";
import { formsOf as consentFormsOf } from "@faridalms/database/stores/consents";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import {
  documentOf,
  translationOf,
} from "@faridalms/database/stores/documents";
import { filesOfHosts, linkFiles } from "@faridalms/database/stores/files";
import {
  APPLICATION_CONSENTS,
  MAX_FILES_PER_ITEM,
} from "@faridalms/domain/admissions";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

import { audit } from "./procedure";

export async function intakeOf(context: UnitContext, id: string) {
  const [intake] = await intakesOf(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    id,
  });
  if (!intake) throw new ORPCError("NOT_FOUND");
  return intake;
}

/**
 * The consents an application asks for, each with the school's published
 * words for it, written in the consents system; null where the school has
 * not published any, which the admissions setup points out.
 */
export async function admissionConsents(context: UnitContext) {
  const [purposes, forms] = await Promise.all([
    descriptorsFor(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      namespace: "consent_purpose",
      today: context.today,
    }),
    consentFormsOf(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
    }),
  ]);
  return APPLICATION_CONSENTS.flatMap((meaning: ApplicationConsent) => {
    const purpose = purposes.find((row) => row.meaning === meaning);
    if (!purpose) return [];
    const notice = forms.published.find((row) => row.purposeId === purpose.id);
    return [
      {
        meaning,
        purposeId: purpose.id,
        labelEn: purpose.labelEn,
        labelAr: purpose.labelAr,
        notice: notice
          ? {
              id: notice.id,
              versionLabel: notice.versionLabel,
              documentId: notice.documentId,
              locale: notice.locale,
            }
          : null,
      },
    ];
  });
}

/** A consent form's words in both languages as they now stand. */
export async function consentWords(context: UnitContext, formId: string) {
  const original = await documentOf(context.tx, context.tenantId, {
    type: "privacy_notice",
    id: formId,
  });
  const translation = original
    ? await translationOf(context.tx, context.tenantId, original.id)
    : null;
  return {
    body: (original?.content ?? null) as ContentDocument | null,
    translation: (translation?.content ?? null) as ContentDocument | null,
  };
}

export async function documentStep(
  context: UnitContext,
  applicationId: string,
  itemId: string,
) {
  const item = (
    await itemsOf(context.tx, {
      tenantId: context.tenantId,
      applicationIds: [applicationId],
    })
  ).find((each) => each.id === itemId);
  if (!item || item.kind !== "document") throw new ORPCError("NOT_FOUND");
  return item;
}

/**
 * Files an uploaded document under a checklist step, which is then in for
 * the office to check. A draft or a live application takes documents; one
 * that has ended does not.
 */
export async function fileDocument(
  context: UnitContext,
  row: ApplicationRow,
  input: { itemId: string; fileId: string },
) {
  if (["withdrawn", "declined_by_school", "enrolled"].includes(row.state))
    throw new ORPCError("CONFLICT", { message: "application.state" });
  const item = await documentStep(context, row.id, input.itemId);
  if (item.state === "verified" || item.state === "waived")
    throw new ORPCError("CONFLICT", { message: "application.item_done" });
  const held = await filesOfHosts(context.tx, context.tenantId, {
    type: "admission_item",
    ids: [item.id],
  });
  if (held.length >= MAX_FILES_PER_ITEM)
    throw new ORPCError("BAD_REQUEST", { message: "application.item_full" });
  const linked = await linkFiles(context.tx, {
    tenantId: context.tenantId,
    userId: context.actor.userId,
    ids: [input.fileId],
    purpose: "admission_document",
    host: { type: "admission_item", id: item.id },
  });
  if (linked.length === 0)
    throw new ORPCError("BAD_REQUEST", { message: "file.not_ready" });
  if (item.state !== "received")
    await setItemState(context.tx, {
      tenantId: context.tenantId,
      applicationId: row.id,
      id: item.id,
      from: ["pending", "rejected"],
      state: "received",
    });
  await insertApplicationEntry(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    applicationId: row.id,
    kind: "item",
    body: "",
    details: {
      itemId: item.id,
      labelEn: item.labelEn,
      labelAr: item.labelAr,
      from: item.state,
      to: "received",
      fileId: input.fileId,
    },
    authorUserId: context.actor.userId,
  });
  await audit(context, {
    action: "admission_item.file",
    objectType: "admission_item",
    objectId: item.id,
    subjectUserId: row.applicantUserId,
    details: { fileId: input.fileId, applicationId: row.id },
  });
  return { itemId: item.id };
}
