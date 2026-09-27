import type { NewsletterState } from "@faridalms/database/tables/newsletters";
import type { NewsletterContent } from "@faridalms/domain/newsletters";

import {
  audiencesOf,
  audienceUsers,
  setAudiences,
} from "@faridalms/database/stores/audiences";
import {
  documentOf,
  dropTranslation,
  publishedVersion,
  saveDocument,
  saveTranslation,
  snapshotPublish,
  translationOf,
} from "@faridalms/database/stores/documents";
import {
  addNewsletterRecipients,
  editionsFor,
  insertNewsletter,
  managedNewsletters,
  markNewsletterRead,
  newsletterById,
  newsletterRecipientOf,
  newsletterReport,
  setNewsletterState,
  updateNewsletter,
} from "@faridalms/database/stores/newsletters";
import {
  alignTranslation,
  editionFileIds,
  editionPlainText,
  listQuerySchema,
  manageNewslettersSchema,
  newsletterRefSchema,
  publishNewsletterSchema,
  saveNewsletterSchema,
} from "@faridalms/domain/newsletters";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { audienceChoices, audienceOf } from "../core/audiences";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { registerHostReader } from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());

const TAB_STATES: Record<string, NewsletterState[]> = {
  drafts: ["draft"],
  scheduled: ["scheduled"],
  published: ["published"],
  archived: ["archived"],
};

const host = (newsletterId: string) => ({
  type: "newsletter",
  id: newsletterId,
});

async function ofSchool(context: UnitContext, newsletterId: string) {
  const row = await newsletterById(context.tx, context.tenantId, newsletterId);
  if (!row || row.orgId !== context.schoolId) throw new ORPCError("NOT_FOUND");
  return row;
}

/** An edition of this school the viewer may read, or not found. */
async function readable(context: UnitContext, newsletterId: string) {
  const row = await ofSchool(context, newsletterId);
  if (can(context, "newsletters:manage")) return { row, recipient: null };
  const recipient = await newsletterRecipientOf(context.tx, {
    tenantId: context.tenantId,
    newsletterId: row.id,
    userId: context.actor.userId,
  });
  const out =
    (row.state === "published" || row.state === "scheduled") &&
    row.publishAt !== null &&
    Date.parse(row.publishAt) <= context.now.getTime();
  if (!recipient || !out) throw new ORPCError("NOT_FOUND");
  return { row, recipient };
}

registerHostReader("newsletter", async (context, hostId) => {
  try {
    await readable(context, hostId);
    return true;
  } catch {
    return false;
  }
});

/** The two languages as they are being written. */
async function drafts(context: UnitContext, newsletterId: string) {
  const original = await documentOf(
    context.tx,
    context.tenantId,
    host(newsletterId),
  );
  const translation = original
    ? await translationOf(context.tx, context.tenantId, original.id)
    : null;
  return { original, translation };
}

/** The two languages as readers last received them, with whether edits wait since. */
async function edition(context: UnitContext, newsletterId: string) {
  const { original, translation } = await drafts(context, newsletterId);
  if (!original) return null;
  const [published, publishedTranslation] = await Promise.all([
    publishedVersion(context.tx, context.tenantId, original.id),
    translation
      ? publishedVersion(context.tx, context.tenantId, translation.id)
      : Promise.resolve(null),
  ]);
  if (!published) return null;
  return {
    content: published.content as unknown as NewsletterContent,
    translation: (publishedTranslation?.content ??
      null) as unknown as NewsletterContent | null,
    changedSince:
      original.version > published.documentVersion ||
      (translation !== null &&
        translation.version > (publishedTranslation?.documentVersion ?? 0)),
  };
}

export const list = readProcedure
  .input(listQuerySchema)
  .handler(async ({ input, context }) => ({
    rows: await editionsFor(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      q: input.q,
    }),
    canManage: can(context, "newsletters:manage"),
  }));

export const manage = readProcedure
  .input(manageNewslettersSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "newsletters:manage");
    return {
      rows: await managedNewsletters(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        states: TAB_STATES[input.tab] ?? ["published"],
        q: input.q,
      }),
    };
  });

/** The classes and grades an edition can go to. */
export const options = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "newsletters:manage");
  return audienceChoices(context);
});

export const editor = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "newsletters:manage");
    const row = await ofSchool(context, input.id);
    const [audiences, { original, translation }] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, {
        kind: "newsletter",
        id: row.id,
      }),
      drafts(context, row.id),
    ]);
    return {
      ...row,
      audiences,
      content: (original?.content ??
        null) as unknown as NewsletterContent | null,
      translation: (translation?.content ??
        null) as unknown as NewsletterContent | null,
    };
  });

/**
 * One edition as its reader sees it. Those who manage newsletters also see a
 * draft never sent (as a preview) and who an edition reached.
 */
export const record = readProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const { row, recipient } = await readable(context, input.id);
    const manages = can(context, "newsletters:manage");
    const [audiences, out, report] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, {
        kind: "newsletter",
        id: row.id,
      }),
      edition(context, row.id),
      manages
        ? newsletterReport(context.tx, {
            tenantId: context.tenantId,
            newsletterId: row.id,
          })
        : Promise.resolve(null),
    ]);
    let shown = out;
    if (!shown && manages) {
      const { original, translation } = await drafts(context, row.id);
      shown = {
        content: (original?.content ?? {
          sections: [],
          reviewed: [],
        }) as unknown as NewsletterContent,
        translation: (translation?.content ??
          null) as unknown as NewsletterContent | null,
        changedSince: false,
      };
    }
    if (!shown) throw new ORPCError("NOT_FOUND");
    return {
      ...row,
      audiences,
      content: shown.content,
      translation: row.bilingual ? shown.translation : null,
      preview: out === null,
      changedSince: shown.changedSince,
      readAt: recipient?.readAt ?? null,
      canManage: manages,
      report,
    };
  });

export const save = writeProcedure
  .input(saveNewsletterSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "newsletters:manage");
    const fields = {
      title: input.title,
      primaryLocale: input.primaryLocale,
      bilingual: input.bilingual,
    };
    let newsletterId = input.id;
    let version: number;
    let keepFiles: string[] = [];
    if (input.id) {
      const row = await ofSchool(context, input.id);
      if (row.state === "archived")
        throw new ORPCError("CONFLICT", { message: "newsletters.archived" });
      const next = await updateNewsletter(context.tx, {
        tenantId: context.tenantId,
        id: input.id,
        expectedVersion: input.expectedVersion,
        ...fields,
      });
      if (next === null)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      version = next;
      const out = await edition(context, row.id);
      // What readers already have must keep its pictures while edits wait.
      if (out)
        keepFiles = [
          ...editionFileIds(out.content),
          ...(out.translation ? editionFileIds(out.translation) : []),
        ];
    } else {
      const created = await insertNewsletter(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        authorId: context.actor.userId,
        ...fields,
      });
      newsletterId = created.id;
      version = created.version;
    }
    await setAudiences(context.tx, {
      tenantId: context.tenantId,
      owner: { kind: "newsletter", id: newsletterId },
      audiences: input.audiences.map(audienceOf),
    });
    const content = { sections: input.content.sections, reviewed: [] };
    const original = await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host: host(newsletterId),
      kind: "newsletter",
      locale: input.primaryLocale,
      content,
      plainText: editionPlainText(content),
      mediaIds: [...new Set([...editionFileIds(content), ...keepFiles])],
      userId: context.actor.userId,
    });
    if (input.bilingual && input.translation) {
      const translation = alignTranslation(content, input.translation);
      await saveTranslation(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host: host(newsletterId),
        originalId: original.id,
        locale: input.primaryLocale === "en" ? "ar" : "en",
        kind: "newsletter",
        content: translation,
        plainText: editionPlainText(translation),
        mediaIds: editionFileIds(translation),
        userId: context.actor.userId,
      });
    } else if (!input.bilingual) {
      await dropTranslation(context.tx, {
        tenantId: context.tenantId,
        originalId: original.id,
      });
    }
    await audit(context, {
      action: input.id ? "newsletter.update" : "newsletter.create",
      objectType: "newsletter",
      objectId: newsletterId,
      details: { title: input.title },
    });
    return { id: newsletterId, version };
  });

/**
 * Sends an edition now or at a set time, fixing who it reaches and taking the
 * snapshot readers see. Publishing one already out replaces what readers have
 * and reaches anyone newly in its audience.
 */
export const publish = writeProcedure
  .input(publishNewsletterSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "newsletters:manage");
    const row = await ofSchool(context, input.id);
    if (row.state === "archived")
      throw new ORPCError("CONFLICT", { message: "newsletters.archived" });
    const revising = row.state === "published";
    const later =
      input.publishAt !== "" &&
      Date.parse(input.publishAt) > context.now.getTime();
    if (revising && later)
      throw new ORPCError("BAD_REQUEST", {
        message: "newsletters.already_out",
      });
    const { original, translation } = await drafts(context, row.id);
    const sections =
      (original?.content as unknown as NewsletterContent | undefined)
        ?.sections ?? [];
    if (!original || sections.length === 0)
      throw new ORPCError("CONFLICT", { message: "newsletters.no_sections" });
    const audiences = await audiencesOf(context.tx, context.tenantId, {
      kind: "newsletter",
      id: row.id,
    });
    const users = await audienceUsers(
      context.tx,
      {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        on: context.today,
      },
      audiences,
    );
    if (users.length === 0)
      throw new ORPCError("CONFLICT", { message: "newsletters.nobody" });
    const version = await setNewsletterState(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      state: later ? "scheduled" : "published",
      publishAt: revising
        ? row.publishAt
        : later
          ? input.publishAt
          : context.now.toISOString(),
      revised: revising,
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await snapshotPublish(context.tx, {
      tenantId: context.tenantId,
      documentId: original.id,
      userId: context.actor.userId,
    });
    if (row.bilingual && translation)
      await snapshotPublish(context.tx, {
        tenantId: context.tenantId,
        documentId: translation.id,
        userId: context.actor.userId,
      });
    const added = await addNewsletterRecipients(context.tx, {
      tenantId: context.tenantId,
      newsletterId: row.id,
      userIds: users,
    });
    await audit(context, {
      action: revising
        ? "newsletter.revise"
        : later
          ? "newsletter.schedule"
          : "newsletter.publish",
      objectType: "newsletter",
      objectId: row.id,
      details: {
        recipients: users.length,
        added,
        publishAt: input.publishAt || null,
      },
    });
    return { version, recipients: users.length };
  });

export const archive = writeProcedure
  .input(newsletterRefSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "newsletters:manage");
    const row = await ofSchool(context, input.id);
    const version = await setNewsletterState(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      state: "archived",
      publishAt: row.publishAt ?? context.now.toISOString(),
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "newsletter.archive",
      objectType: "newsletter",
      objectId: row.id,
    });
    return { version };
  });

/** A new draft with an edition's title, audiences and both languages as they stand. */
export const duplicate = writeProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "newsletters:manage");
    const row = await ofSchool(context, input.id);
    const [audiences, { original, translation }] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, {
        kind: "newsletter",
        id: row.id,
      }),
      drafts(context, row.id),
    ]);
    const created = await insertNewsletter(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      authorId: context.actor.userId,
      title: row.title,
      primaryLocale: row.primaryLocale,
      bilingual: row.bilingual,
    });
    await setAudiences(context.tx, {
      tenantId: context.tenantId,
      owner: { kind: "newsletter", id: created.id },
      audiences,
    });
    if (original) {
      const content = original.content as unknown as NewsletterContent;
      const copy = await saveDocument(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host: host(created.id),
        kind: "newsletter",
        locale: row.primaryLocale,
        content: original.content,
        plainText: original.plainText,
        mediaIds: editionFileIds(content),
        userId: context.actor.userId,
      });
      if (row.bilingual && translation)
        await saveTranslation(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          host: host(created.id),
          originalId: copy.id,
          locale: row.primaryLocale === "en" ? "ar" : "en",
          kind: "newsletter",
          content: translation.content,
          plainText: translation.plainText,
          mediaIds: editionFileIds(
            translation.content as unknown as NewsletterContent,
          ),
          userId: context.actor.userId,
        });
    }
    await audit(context, {
      action: "newsletter.duplicate",
      objectType: "newsletter",
      objectId: created.id,
      details: { from: row.id },
    });
    return created;
  });

/** A reader opened an edition. */
export const seen = writeProcedure
  .input(v.object({ id }))
  .handler(async ({ input, context }) => {
    const { row, recipient } = await readable(context, input.id);
    if (!recipient) return { seen: false };
    await markNewsletterRead(context.tx, {
      tenantId: context.tenantId,
      newsletterId: row.id,
      userId: context.actor.userId,
    });
    return { seen: true };
  });
