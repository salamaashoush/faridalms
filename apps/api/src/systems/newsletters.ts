import type { NewsletterState } from "@faridalms/database/tables/newsletters";
import type { ContentDocument } from "@faridalms/domain/content";

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
  reviewTranslation,
  setNewsletterState,
  translationReview,
  updateNewsletter,
} from "@faridalms/database/stores/newsletters";
import { readSubject } from "@faridalms/database/stores/notifications";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  documentWritten,
  listQuerySchema,
  manageNewslettersSchema,
  newsletterRefSchema,
  publishNewsletterSchema,
  reviewTranslationSchema,
  saveNewsletterSchema,
} from "@faridalms/domain/newsletters";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { audienceChoices, audienceOf } from "../core/audiences";
import { notify } from "../core/notify";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { registerHostReader, usableMedia } from "../files/authorize";

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
    body: published.content as unknown as ContentDocument,
    translation: (publishedTranslation?.content ??
      null) as unknown as ContentDocument | null,
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
    const [audiences, { original, translation }, review, out] =
      await Promise.all([
        audiencesOf(context.tx, context.tenantId, {
          kind: "newsletter",
          id: row.id,
        }),
        drafts(context, row.id),
        translationReview(context.tx, context.tenantId, row.id),
        edition(context, row.id),
      ]);
    return {
      ...row,
      audiences,
      changedSince: out?.changedSince ?? false,
      body: (original?.content ?? null) as unknown as ContentDocument | null,
      translation: (translation?.content ??
        null) as unknown as ContentDocument | null,
      translationReview: review,
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
    const [audiences, out, report, review] = await Promise.all([
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
      manages
        ? translationReview(context.tx, context.tenantId, row.id)
        : Promise.resolve(null),
    ]);
    let shown = out;
    if (!shown && manages) {
      const { original, translation } = await drafts(context, row.id);
      shown = {
        body: (original?.content ??
          emptyContent()) as unknown as ContentDocument,
        translation: (translation?.content ??
          null) as unknown as ContentDocument | null,
        changedSince: false,
      };
    }
    if (!shown) throw new ORPCError("NOT_FOUND");
    return {
      ...row,
      audiences,
      body: shown.body,
      translation: row.bilingual ? shown.translation : null,
      translationReview: review,
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
    let before: { plainText: string } | null = null;
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
      before = (await drafts(context, row.id)).translation;
      const out = await edition(context, row.id);
      // What readers already have must keep its pictures while edits wait.
      if (out)
        keepFiles = [
          ...contentFileIds(out.body),
          ...(out.translation ? contentFileIds(out.translation) : []),
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
    const original = await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host: host(newsletterId),
      kind: "newsletter",
      locale: input.primaryLocale,
      content: input.body,
      plainText: contentPlainText(input.body),
      mediaIds: [
        ...new Set([
          ...(await usableMedia(context, contentFileIds(input.body))),
          ...keepFiles,
        ]),
      ],
      userId: context.actor.userId,
    });
    if (input.bilingual && input.translation) {
      await saveTranslation(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host: host(newsletterId),
        originalId: original.id,
        locale: input.primaryLocale === "en" ? "ar" : "en",
        kind: "newsletter",
        content: input.translation,
        plainText: contentPlainText(input.translation),
        mediaIds: await usableMedia(context, contentFileIds(input.translation)),
        userId: context.actor.userId,
      });
    } else if (!input.bilingual) {
      await dropTranslation(context.tx, {
        tenantId: context.tenantId,
        originalId: original.id,
      });
    }
    // A check lapses by itself once the original's words change; a translation
    // rewritten, or dropped, needs checking again.
    if (
      !input.bilingual ||
      !input.translation ||
      contentPlainText(input.translation) !== (before?.plainText ?? "")
    ) {
      const cleared = await reviewTranslation(context.tx, {
        tenantId: context.tenantId,
        id: newsletterId,
        userId: context.actor.userId,
        reviewed: false,
      });
      if (cleared !== null) version = cleared;
    }
    await audit(context, {
      action: input.id ? "newsletter.update" : "newsletter.create",
      objectType: "newsletter",
      objectId: newsletterId,
      details: { title: input.title },
    });
    return {
      id: newsletterId,
      version,
      translationReview: await translationReview(
        context.tx,
        context.tenantId,
        newsletterId,
      ),
    };
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
    if (
      !original ||
      !documentWritten(original.content as unknown as ContentDocument)
    )
      throw new ORPCError("CONFLICT", { message: "newsletters.empty" });
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
    // A revised edition replaces what readers have without ringing again.
    if (!later && !revising)
      await notify(context, users, {
        kind: "newsletter",
        subject: { type: "newsletter", id: row.id },
        params: { title: row.title },
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

/**
 * Records that the translation was checked against the original as it now
 * reads, or takes the check back. Only a written translation can be checked.
 */
export const review = writeProcedure
  .input(reviewTranslationSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "newsletters:manage");
    const row = await ofSchool(context, input.id);
    if (row.version !== input.expectedVersion)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    const { translation } = await drafts(context, row.id);
    if (
      input.reviewed &&
      (!row.bilingual ||
        !documentWritten(translation?.content as unknown as ContentDocument))
    )
      throw new ORPCError("CONFLICT", {
        message: "newsletters.nothing_to_check",
      });
    const version = await reviewTranslation(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      userId: context.actor.userId,
      reviewed: input.reviewed,
    });
    await audit(context, {
      action: input.reviewed
        ? "newsletter.translation_checked"
        : "newsletter.translation_unchecked",
      objectType: "newsletter",
      objectId: row.id,
    });
    return {
      version: version ?? row.version,
      review: await translationReview(context.tx, context.tenantId, row.id),
    };
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
    const [audiences, { original, translation }, checked] = await Promise.all([
      audiencesOf(context.tx, context.tenantId, {
        kind: "newsletter",
        id: row.id,
      }),
      drafts(context, row.id),
      translationReview(context.tx, context.tenantId, row.id),
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
      const content = original.content as unknown as ContentDocument;
      const copy = await saveDocument(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host: host(created.id),
        kind: "newsletter",
        locale: row.primaryLocale,
        content: original.content,
        plainText: original.plainText,
        mediaIds: contentFileIds(content),
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
          mediaIds: contentFileIds(
            translation.content as unknown as ContentDocument,
          ),
          userId: context.actor.userId,
        });
      if (row.bilingual && translation && checked?.current) {
        const version = await reviewTranslation(context.tx, {
          tenantId: context.tenantId,
          id: created.id,
          userId: context.actor.userId,
          reviewed: true,
        });
        if (version !== null) created.version = version;
      }
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
    await readSubject(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      subjectType: "newsletter",
      subjectId: row.id,
    });
    return { seen: true };
  });
