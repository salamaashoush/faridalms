import type { SaveMessageDraftInput } from "@faridalms/domain/message-draft";

import { and, count, desc, eq, isNull } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../index";
import type { ComposeInput } from "./communication";

import { messageDraftFiles, messageDrafts } from "../schema";
import { insertMessage } from "./communication";
import { fileSummary, ownedReadyFiles } from "./files";
import { ManagementError } from "./management";

type Executor = Database | DatabaseTransaction;

export async function getMessageDraft(
  db: Executor,
  authorId: string,
  id: string,
) {
  const draft = await db.query.messageDrafts.findFirst({
    where: { id, authorId },
    with: { files: { with: { file: true }, orderBy: { position: "asc" } } },
  });
  if (!draft) return undefined;
  const { files, ...row } = draft;
  return {
    ...row,
    files: files.flatMap((link) => (link.file ? [fileSummary(link.file)] : [])),
  };
}

async function replaceDraftFiles(
  db: Executor,
  draftId: string,
  authorId: string,
  fileIds: string[],
) {
  const files = await ownedReadyFiles(
    db,
    authorId,
    fileIds,
    "message_attachment",
  );
  if (files.length !== fileIds.length)
    throw new ManagementError("BAD_REQUEST", "message.file_missing");
  await db
    .delete(messageDraftFiles)
    .where(eq(messageDraftFiles.draftId, draftId));
  if (fileIds.length)
    await db
      .insert(messageDraftFiles)
      .values(
        fileIds.map((fileId, position) => ({ draftId, fileId, position })),
      );
}

export async function listMessageDrafts(
  db: Database,
  authorId: string,
  requestedPage: number,
) {
  const filter = and(
    eq(messageDrafts.authorId, authorId),
    isNull(messageDrafts.sentMessageId),
  );
  const [result] = await db
    .select({ total: count() })
    .from(messageDrafts)
    .where(filter);
  const total = result?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const page = Math.min(requestedPage, pages);
  const rows = await db
    .select({
      id: messageDrafts.id,
      subject: messageDrafts.subject,
      category: messageDrafts.category,
      updatedAt: messageDrafts.updatedAt,
      revision: messageDrafts.revision,
    })
    .from(messageDrafts)
    .where(filter)
    .orderBy(desc(messageDrafts.updatedAt), desc(messageDrafts.id))
    .limit(25)
    .offset((page - 1) * 25);
  return { rows, page, pages, total };
}

export async function saveMessageDraft(
  db: Database,
  authorId: string,
  input: SaveMessageDraftInput,
) {
  const values = {
    category: input.category,
    recipientId: input.recipientId || null,
    studentId: input.studentId || null,
    subject: input.subject,
    body: input.body,
    bodyFormat: input.bodyFormat,
    document: input.bodyFormat === "rich" ? input.document : null,
  };
  return db.transaction(async (tx) => {
    if (input.expectedRevision === 0) {
      const [created] = await tx
        .insert(messageDrafts)
        .values({ ...values, id: input.id, authorId })
        .onConflictDoNothing()
        .returning();
      if (!created)
        throw new ManagementError(
          "CONFLICT",
          "message_draft.revision_conflict",
        );
      await replaceDraftFiles(tx, input.id, authorId, input.fileIds);
      return created;
    }
    const [updated] = await tx
      .update(messageDrafts)
      .set({
        ...values,
        revision: input.expectedRevision + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(messageDrafts.id, input.id),
          eq(messageDrafts.authorId, authorId),
          eq(messageDrafts.revision, input.expectedRevision),
          isNull(messageDrafts.sentMessageId),
        ),
      )
      .returning();
    if (!updated) {
      if (!(await getMessageDraft(tx, authorId, input.id)))
        throw new ManagementError("NOT_FOUND", "message_draft.not_found");
      throw new ManagementError("CONFLICT", "message_draft.revision_conflict");
    }
    await replaceDraftFiles(tx, input.id, authorId, input.fileIds);
    return updated;
  });
}

export async function sendMessageDraft(
  db: Database,
  authorId: string,
  id: string,
  expectedRevision: number,
  message: ComposeInput,
) {
  return db.transaction(async (tx) => {
    const [draft] = await tx
      .select()
      .from(messageDrafts)
      .where(
        and(eq(messageDrafts.id, id), eq(messageDrafts.authorId, authorId)),
      )
      .for("update");
    if (!draft)
      throw new ManagementError("NOT_FOUND", "message_draft.not_found");
    if (draft.revision !== expectedRevision)
      throw new ManagementError("CONFLICT", "message_draft.revision_conflict");
    if (draft.sentMessageId) return { id: draft.sentMessageId };
    const files = await tx.query.messageDraftFiles.findMany({
      where: { draftId: id },
      orderBy: { position: "asc" },
    });
    const messageId = await insertMessage(tx, {
      ...message,
      document: draft.document,
      fileIds: files.map((link) => link.fileId),
    });
    await tx
      .update(messageDrafts)
      .set({ sentMessageId: messageId, updatedAt: new Date() })
      .where(eq(messageDrafts.id, id));
    return { id: messageId };
  });
}
