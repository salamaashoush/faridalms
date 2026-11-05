import type {
  BroadcastFields,
  BroadcastRow,
} from "@faridalms/database/stores/broadcasts";
import type { AudienceInput } from "@faridalms/domain/announcements";
import type { BroadcastKind } from "@faridalms/domain/broadcasts";
import type { Capability } from "@faridalms/domain/capabilities";
import type { ContentDocument } from "@faridalms/domain/content";
import type { PublishRules } from "@faridalms/domain/content-checks";
import type { NoticeParams } from "@faridalms/domain/notifications";
import type { ContentLocale } from "@faridalms/domain/translations";

import {
  audiencesOf,
  audienceUsers,
  setAudiences,
} from "@faridalms/database/stores/audiences";
import {
  addRecipients,
  broadcastById,
  deliveryReport,
  insertBroadcast,
  liveUntold,
  managedBroadcasts,
  markSeen,
  markTold,
  recipientOf,
  recipientsOf,
  resetReads,
  setBroadcastState,
  updateBroadcast,
} from "@faridalms/database/stores/broadcasts";
import {
  saveDocument,
  saveTranslation,
  versionsOf,
} from "@faridalms/database/stores/documents";
import {
  markActed,
  readSubject,
} from "@faridalms/database/stores/notifications";
import {
  reviewTranslation,
  translationReview,
} from "@faridalms/database/stores/translations";
import { contentFileIds, contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { paged, pageWindow } from "@faridalms/domain/paging";
import { isLater, isLive, phaseOf } from "@faridalms/domain/publication";
import { documentWritten, otherLocale } from "@faridalms/domain/translations";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";
import type { LiveScope } from "../core/publication";

import { audienceOf } from "../core/audiences";
import { notify, notifyIn } from "../core/notify";
import { audit, can, localeOf, requireCapability } from "../core/procedure";
import {
  draftWords,
  publishedWords,
  publishWords,
  registerGoLive,
  saveWords,
  tellLive,
  wordsIssues,
} from "../core/publication";
import { sharedInliner } from "../core/shared";
import { registerHostReader, registerHostWriter } from "../files/authorize";

/**
 * What tells the two kinds apart where they behave differently: who writes
 * them, the codes their refusals carry, how they are told, and what more a
 * news post does on the website.
 */
export interface BroadcastKindRules {
  kind: BroadcastKind;
  capability: Capability;
  codes: {
    archived: string;
    alreadyOut: string;
    nobody: string;
    consent: string;
    nothingToCheck: string;
  };
  /** The object its audit entries name, and what replacing a copy already out is called. */
  audit: "announcement" | "news";
  revised: "update_sent" | "revise";
  /** What a notice of it going out says, and whether it asks something of the reader. */
  notice: (
    row: BroadcastRow,
    words: { body: ContentDocument | null; other: ContentDocument | null },
    updated: boolean,
  ) => {
    kind: "announcement" | "urgent" | "news";
    params: NoticeParams;
    needsAction: boolean;
  };
}

export const host = (row: { kind: BroadcastKind; id: string }) => ({
  type: row.kind,
  id: row.id,
});

const owner = (row: { id: string }) => ({
  kind: "broadcast" as const,
  id: row.id,
});

export const primaryOf = (row: BroadcastRow): ContentLocale =>
  row.primaryLocale ?? (row.titleAr && !row.titleEn ? "ar" : "en");

/** Its title in a language, else in its own, else in the other. */
export const titleIn = (row: BroadcastRow, locale: ContentLocale) => {
  const pick = (which: ContentLocale) =>
    which === "ar" ? row.titleAr : row.titleEn;
  return pick(locale) || pick(primaryOf(row)) || pick(otherLocale(locale));
};

/** Rows read in the viewer's language. */
export const titled =
  (context: UnitContext) =>
  <T extends BroadcastRow>(row: T) => ({
    ...row,
    title: titleIn(row, localeOf(context)),
    shown: phaseOf(row, context.now),
  });

const conflict = () =>
  new ORPCError("CONFLICT", { message: "conflict.version" });

/** A broadcast of this kind at this school, or not found. */
export async function ofSchool(
  context: UnitContext,
  rules: BroadcastKindRules,
  id: string,
) {
  const row = await broadcastById(context.tx, context.tenantId, id);
  if (!row || row.orgId !== context.schoolId || row.kind !== rules.kind)
    throw new ORPCError("NOT_FOUND");
  return row;
}

export async function managed(
  context: UnitContext,
  rules: BroadcastKindRules,
  id: string,
) {
  requireCapability(context, rules.capability);
  return ofSchool(context, rules, id);
}

/**
 * A broadcast the viewer may read: any of its kind for those who manage it,
 * otherwise one out that reached them or, for news, is on the website.
 */
export async function readable(
  context: UnitContext,
  rules: BroadcastKindRules,
  id: string,
) {
  const row = await ofSchool(context, rules, id);
  const recipient = await recipientOf(context.tx, {
    tenantId: context.tenantId,
    broadcastId: row.id,
    userId: context.actor.userId,
  });
  if (can(context, rules.capability)) return { row, recipient };
  if (!isLive(row, context.now) || (row.visibility !== "public" && !recipient))
    throw new ORPCError("NOT_FOUND");
  return { row, recipient };
}

function registerKind(rules: BroadcastKindRules) {
  registerHostReader(rules.kind, async (context, hostId) => {
    try {
      await readable(context, rules, hostId);
      return true;
    } catch {
      return false;
    }
  });
  registerHostWriter(rules.kind, async (context, hostId) => {
    if (!can(context, rules.capability)) return false;
    const row = await broadcastById(context.tx, context.tenantId, hostId);
    return (
      row !== null && row.orgId === context.schoolId && row.kind === rules.kind
    );
  });
}

export function manage(
  context: UnitContext,
  rules: BroadcastKindRules,
  input: {
    tab: "drafts" | "scheduled" | "published" | "archived";
    q: string;
    page: number;
  },
) {
  requireCapability(context, rules.capability);
  return managedBroadcasts(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    kind: rules.kind,
    tab: input.tab,
    q: input.q,
    ...pageWindow(input.page),
  }).then(({ rows, counts }) => ({
    ...paged(rows.map(titled(context)), counts[input.tab], input.page),
    counts,
  }));
}

/** A broadcast for its editor: the settings and both languages as they are being written. */
export async function editorOf(
  context: UnitContext,
  rules: BroadcastKindRules,
  id: string,
) {
  const row = await managed(context, rules, id);
  const [audiences, words, review, published] = await Promise.all([
    audiencesOf(context.tx, context.tenantId, owner(row)),
    draftWords(context, host(row)),
    translationReview(context.tx, {
      tenantId: context.tenantId,
      host: rules.kind,
      id: row.id,
    }),
    publishedWords(context, host(row)),
  ]);
  return {
    ...titled(context)(row),
    primaryLocale: primaryOf(row),
    audiences,
    body: words.body ?? emptyContent(),
    translation: words.other,
    translationReview: review,
    changedSince: published?.changedSince ?? false,
    /** The words its readers have, which waiting edits can go back to. */
    sent: published
      ? { body: published.body, translation: published.translation }
      : null,
  };
}

/**
 * One broadcast as its reader sees it: the copy last published. Those who
 * manage the kind also see a draft never sent, as a preview, and who it
 * reached.
 */
export async function recordOf(
  context: UnitContext,
  rules: BroadcastKindRules,
  id: string,
) {
  const { row, recipient } = await readable(context, rules, id);
  const manages = can(context, rules.capability);
  const [audiences, published, report, review, words] = await Promise.all([
    audiencesOf(context.tx, context.tenantId, owner(row)),
    publishedWords(context, host(row)),
    manages
      ? deliveryReport(context.tx, {
          tenantId: context.tenantId,
          broadcastId: row.id,
        })
      : Promise.resolve(null),
    manages
      ? translationReview(context.tx, {
          tenantId: context.tenantId,
          host: rules.kind,
          id: row.id,
        })
      : Promise.resolve(null),
    draftWords(context, host(row)),
  ]);
  const shown =
    published ??
    (manages
      ? {
          body: words.body ?? emptyContent(),
          translation: words.other,
          changedSince: false,
        }
      : null);
  if (!shown) throw new ORPCError("NOT_FOUND");
  const sends = words.original
    ? (
        await versionsOf(context.tx, context.tenantId, words.original.id)
      ).filter((version) => version.reason === "publish")
    : [];
  return {
    ...titled(context)(row),
    primaryLocale: primaryOf(row),
    /** When a copy already out was last replaced for its readers. */
    updatedAt: sends.length > 1 ? (sends[0]?.createdAt ?? null) : null,
    audiences,
    body: shown.body,
    translation: shown.translation,
    translationReview: review,
    preview: published === null,
    changedSince: shown.changedSince,
    readAt: recipient?.readAt ?? null,
    acknowledgedAt: recipient?.acknowledgedAt ?? null,
    canManage: manages,
    report,
  };
}

/** Writes a broadcast's settings, audience and words, opening one the first time. */
export async function saveBroadcast(
  context: UnitContext,
  rules: BroadcastKindRules,
  input: {
    id: string;
    expectedVersion: number;
    primaryLocale: ContentLocale;
    body: ContentDocument;
    translation: ContentDocument | null;
    audiences: readonly AudienceInput[];
    fields: BroadcastFields;
    details: Record<string, unknown>;
  },
) {
  requireCapability(context, rules.capability);
  let id = input.id;
  let version: number;
  if (input.id) {
    const row = await managed(context, rules, input.id);
    if (row.state === "archived")
      throw new ORPCError("CONFLICT", { message: rules.codes.archived });
    const next = await updateBroadcast(context.tx, {
      tenantId: context.tenantId,
      id: row.id,
      expectedVersion: input.expectedVersion,
      ...input.fields,
    });
    if (next === null) throw conflict();
    version = next;
  } else {
    const created = await insertBroadcast(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      authorId: context.actor.userId,
      kind: rules.kind,
      ...input.fields,
    });
    id = created.id;
    version = created.version;
  }
  const target = { kind: rules.kind, id };
  await setAudiences(context.tx, {
    tenantId: context.tenantId,
    owner: owner(target),
    audiences: input.audiences.map(audienceOf),
  });
  const cleared = await saveWords(context, host(target), {
    primaryLocale: input.primaryLocale,
    body: input.body,
    translation: input.translation,
    beside: input.fields.coverFileId ? [input.fields.coverFileId] : [],
    review: rules.kind,
  });
  if (cleared.version !== null) version = cleared.version;
  await audit(context, {
    action: input.id ? `${rules.audit}.update` : `${rules.audit}.create`,
    objectType: rules.kind,
    objectId: id,
    details: input.details,
  });
  return {
    id,
    version,
    translationReview: await translationReview(context.tx, {
      tenantId: context.tenantId,
      host: rules.kind,
      id,
    }),
  };
}

/** The people a broadcast's audience names today. */
async function audienceOfRow(context: UnitContext, row: BroadcastRow) {
  return audienceUsers(
    context.tx,
    {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      on: context.today,
    },
    await audiencesOf(context.tx, context.tenantId, owner(row)),
  );
}

/**
 * Sends a broadcast now or at a set time: its words are checked by the one
 * check list and snapshotted for readers, and who it reaches is fixed and
 * told once it is out. Publishing one already out replaces what readers
 * have and reaches anyone newly in its audience; whether they hear of it
 * again is the caller's to say. `website` writes or withdraws the website's
 * copy for news.
 */
export async function publishBroadcast(
  context: UnitContext,
  rules: BroadcastKindRules,
  input: {
    id: string;
    expectedVersion: number;
    publishAt: string;
    /** Required to replace one already out; refused without it where the kind asks. */
    revise: "refuse" | "quietly" | "telling";
    /** What stops this kind going out beyond the words' own checks, given the words as they will read. */
    check?: (
      row: BroadcastRow,
      body: ContentDocument,
      other: ContentDocument | null,
    ) => Promise<void> | void;
    website?: (
      row: BroadcastRow,
      body: ContentDocument,
      other: ContentDocument | null,
      publishAt: string,
    ) => Promise<void>;
  },
) {
  const row = await managed(context, rules, input.id);
  if (row.state === "archived")
    throw new ORPCError("CONFLICT", { message: rules.codes.archived });
  const out = isLive(row, context.now);
  const later = isLater(input.publishAt, context.now);
  if (out && input.revise === "refuse")
    throw new ORPCError("CONFLICT", { message: rules.codes.alreadyOut });
  if (out && later)
    throw new ORPCError("BAD_REQUEST", { message: rules.codes.alreadyOut });
  const words = await draftWords(context, host(row));
  // Readers see shared blocks as they stand, so they are checked in place,
  // and a website copy stands on its own with them written into it.
  const inline = await sharedInliner(
    context,
    [words.body, words.other].filter(
      (document): document is ContentDocument => document !== null,
    ),
  );
  const body = inline(words.body ?? emptyContent());
  const other = words.other ? inline(words.other) : null;
  await input.check?.(row, body, other);
  const users = await audienceOfRow(context, row);
  if (row.visibility === "school" && users.length === 0)
    throw new ORPCError("CONFLICT", { message: rules.codes.nobody });
  const publishAt =
    out && row.publishAt
      ? row.publishAt
      : later
        ? input.publishAt
        : context.now.toISOString();
  const telling = !later && (!out || input.revise === "telling");
  const version = await setBroadcastState(context.tx, {
    tenantId: context.tenantId,
    id: row.id,
    expectedVersion: input.expectedVersion,
    state: "published",
    publishAt,
    told: later ? "later" : telling ? "now" : "keep",
    updateSent: out && input.revise === "telling",
  });
  if (version === null) throw conflict();
  await publishWords(context, host(row), {
    live: !later,
    title: titleIn(row, "en"),
    titleAr: titleIn(row, "ar"),
  });
  await input.website?.(row, body, other, publishAt);
  const added = await addRecipients(context.tx, {
    tenantId: context.tenantId,
    broadcastId: row.id,
    userIds: users,
  });
  if (out && input.revise === "telling")
    await resetReads(context.tx, {
      tenantId: context.tenantId,
      broadcastId: row.id,
    });
  if (telling && users.length > 0) {
    const notice = rules.notice(row, { body, other }, out);
    await notify(context, users, {
      kind: notice.kind,
      subject: host(row),
      params: notice.params,
      needsAction: notice.needsAction,
    });
  }
  await audit(context, {
    action: out
      ? `${rules.audit}.${rules.revised}`
      : later
        ? `${rules.audit}.schedule`
        : `${rules.audit}.publish`,
    objectType: rules.kind,
    objectId: row.id,
    details: {
      visibility: row.visibility,
      recipients: users.length,
      added,
      publishAt: input.publishAt || null,
    },
  });
  return { version, recipients: users.length };
}

/** What stops its words going out: the one check list and consent to photos inside the school. */
export async function checkWords(
  context: UnitContext,
  rules: BroadcastKindRules,
  documents: readonly (ContentDocument | null)[],
  options: PublishRules & { beside?: readonly string[]; consent: boolean },
) {
  const issues = await wordsIssues(context, documents, options);
  if (issues.includes("consent"))
    throw new ORPCError("CONFLICT", { message: rules.codes.consent });
  return issues;
}

/** Takes a broadcast off its readers, back to a draft or into the archive. */
export async function takeDown(
  context: UnitContext,
  rules: BroadcastKindRules,
  input: { id: string; expectedVersion: number },
  state: "draft" | "archived",
  withdraw?: (row: BroadcastRow) => Promise<void>,
) {
  const row = await managed(context, rules, input.id);
  const version = await setBroadcastState(context.tx, {
    tenantId: context.tenantId,
    id: row.id,
    expectedVersion: input.expectedVersion,
    state,
    publishAt: state === "draft" ? null : row.publishAt,
    told: "keep",
  });
  if (version === null) throw conflict();
  await withdraw?.(row);
  await audit(context, {
    action:
      state === "archived"
        ? `${rules.audit}.archive`
        : `${rules.audit}.unpublish`,
    objectType: rules.kind,
    objectId: row.id,
  });
  return { version };
}

/**
 * Records that the translation was checked against the original as it now
 * reads, or takes the check back. Only a written translation can be checked.
 */
export async function reviewBroadcast(
  context: UnitContext,
  rules: BroadcastKindRules,
  input: { id: string; expectedVersion: number; reviewed: boolean },
) {
  const row = await managed(context, rules, input.id);
  if (row.version !== input.expectedVersion) throw conflict();
  if (
    input.reviewed &&
    !documentWritten((await draftWords(context, host(row))).other)
  )
    throw new ORPCError("CONFLICT", { message: rules.codes.nothingToCheck });
  const version = await reviewTranslation(context.tx, {
    tenantId: context.tenantId,
    host: rules.kind,
    id: row.id,
    userId: context.actor.userId,
    reviewed: input.reviewed,
  });
  await audit(context, {
    action: input.reviewed
      ? `${rules.audit}.translation_checked`
      : `${rules.audit}.translation_unchecked`,
    objectType: rules.kind,
    objectId: row.id,
  });
  return {
    version: version ?? row.version,
    review: await translationReview(context.tx, {
      tenantId: context.tenantId,
      host: rules.kind,
      id: row.id,
    }),
  };
}

/** A new draft with a broadcast's settings, audience and both languages as they stand. */
export async function duplicateBroadcast(
  context: UnitContext,
  rules: BroadcastKindRules,
  id: string,
  fields: (row: BroadcastRow) => BroadcastFields,
) {
  const row = await managed(context, rules, id);
  const [audiences, words, checked] = await Promise.all([
    audiencesOf(context.tx, context.tenantId, owner(row)),
    draftWords(context, host(row)),
    translationReview(context.tx, {
      tenantId: context.tenantId,
      host: rules.kind,
      id: row.id,
    }),
  ]);
  const created = await insertBroadcast(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    authorId: context.actor.userId,
    kind: rules.kind,
    ...fields(row),
  });
  const target = host({ kind: rules.kind, id: created.id });
  await setAudiences(context.tx, {
    tenantId: context.tenantId,
    owner: owner(created),
    audiences,
  });
  if (words.original && words.body) {
    const locale = words.original.locale ?? primaryOf(row);
    const copy = await saveDocument(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      host: target,
      kind: "rich_text",
      locale,
      content: words.original.content,
      plainText: words.original.plainText,
      mediaIds: [
        ...new Set([
          ...contentFileIds(words.body),
          ...(row.coverFileId ? [row.coverFileId] : []),
        ]),
      ],
      userId: context.actor.userId,
    });
    if (words.translation && words.other) {
      await saveTranslation(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        host: target,
        originalId: copy.id,
        locale: otherLocale(locale),
        kind: "rich_text",
        content: words.translation.content,
        plainText: contentPlainText(words.other),
        mediaIds: contentFileIds(words.other),
        userId: context.actor.userId,
      });
      if (checked?.current) {
        const version = await reviewTranslation(context.tx, {
          tenantId: context.tenantId,
          host: rules.kind,
          id: created.id,
          userId: context.actor.userId,
          reviewed: true,
        });
        if (version !== null) created.version = version;
      }
    }
  }
  await audit(context, {
    action: `${rules.audit}.duplicate`,
    objectType: rules.kind,
    objectId: created.id,
    details: { from: row.id },
  });
  return created;
}

/** A reader opened a broadcast, or acknowledged one that asks for it. */
export async function seenBroadcast(
  context: UnitContext,
  rules: BroadcastKindRules,
  input: { id: string; acknowledge: boolean },
) {
  const { row, recipient } = await readable(context, rules, input.id);
  if (!recipient) return { seen: false };
  if (input.acknowledge && !row.requiresAck)
    throw new ORPCError("BAD_REQUEST", { message: "announcements.no_ack" });
  await markSeen(context.tx, {
    tenantId: context.tenantId,
    broadcastId: row.id,
    userId: context.actor.userId,
    acknowledge: input.acknowledge,
  });
  const subject = {
    tenantId: context.tenantId,
    userId: context.actor.userId,
    subjectType: rules.kind,
    subjectId: row.id,
  };
  await (input.acknowledge
    ? markActed(context.tx, subject)
    : readSubject(context.tx, subject));
  return { seen: true };
}

const kinds = new Map<BroadcastKind, BroadcastKindRules>();

/** Each kind's rules, for the clock that tells a broadcast set for later once it is out. */
export function defineKind(rules: BroadcastKindRules): BroadcastKindRules {
  kinds.set(rules.kind, rules);
  registerKind(rules);
  return rules;
}

registerGoLive<BroadcastRow>("broadcast", {
  due: (tx, input) => liveUntold(tx, input),
  schoolOf: (row) => row.orgId,
  authorOf: (row) => row.authorUserId,
  live: async (scope: LiveScope, row) => {
    const rules = kinds.get(row.kind);
    const users = await recipientsOf(scope.tx, {
      tenantId: scope.tenantId,
      broadcastId: row.id,
    });
    if (rules && users.length > 0) {
      const published = await publishedWords(scope, host(row));
      const notice = rules.notice(
        row,
        {
          body: published?.body ?? null,
          other: published?.translation ?? null,
        },
        false,
      );
      await notifyIn(scope, users, {
        kind: notice.kind,
        subject: host(row),
        params: notice.params,
        needsAction: notice.needsAction,
      });
    }
    await tellLive(scope, host(row), {
      title: titleIn(row, "en"),
      titleAr: titleIn(row, "ar"),
    });
    await markTold(scope.tx, { tenantId: scope.tenantId, id: row.id });
  },
});
