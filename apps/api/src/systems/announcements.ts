import type { SaveAnnouncement } from "@faridalms/domain/announcements";

import { announcementFeed } from "@faridalms/database/stores/broadcasts";
import {
  archiveAnnouncementSchema,
  feedQuerySchema,
  manageQuerySchema,
  publishAnnouncementSchema,
  saveAnnouncementSchema,
  seenSchema,
} from "@faridalms/domain/announcements";
import { contentPlainText } from "@faridalms/domain/content";
import { CONTENT_ISSUE_CODE } from "@faridalms/domain/content-checks";
import { reviewTranslationSchema } from "@faridalms/domain/translations";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import { audienceChoices } from "../core/audiences";
import {
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import {
  checkWords,
  defineKind,
  duplicateBroadcast,
  editorOf,
  manage as manageKind,
  publishBroadcast,
  recordOf,
  reviewBroadcast,
  saveBroadcast,
  seenBroadcast,
  takeDown,
  titled,
  titleIn,
} from "./broadcasts";

const id = v.pipe(v.string(), v.uuid());

/** An announcement: a broadcast to its audience that can ask to be acknowledged. */
const rules = defineKind({
  kind: "announcement",
  capability: "announcements:manage",
  codes: {
    archived: "announcements.archived",
    alreadyOut: "announcements.already_out",
    nobody: "announcements.nobody",
    consent: "announcements.consent",
    nothingToCheck: "announcements.nothing_to_check",
  },
  audit: "announcement",
  revised: "update_sent",
  notice: (row, words, updated) => ({
    kind: row.urgency === "urgent" ? "urgent" : "announcement",
    params: {
      title: titleIn(row, "en"),
      titleAr: titleIn(row, "ar"),
      preview: words.body ? contentPlainText(words.body).slice(0, 160) : "",
      updated,
    },
    needsAction: row.requiresAck,
  }),
});

const fieldsOf = (
  input: Pick<
    SaveAnnouncement,
    | "titleEn"
    | "titleAr"
    | "urgency"
    | "pinnedUntil"
    | "expiresOn"
    | "requiresAck"
    | "ackDueOn"
  >,
) => ({
  titleEn: input.titleEn,
  titleAr: input.titleAr,
  visibility: "school" as const,
  urgency: input.urgency,
  pinnedUntil: input.pinnedUntil || null,
  expiresOn: input.expiresOn || null,
  requiresAck: input.requiresAck,
  ackDueOn: input.requiresAck ? input.ackDueOn || null : null,
  categoryId: null,
  slug: null,
  excerptEn: "",
  excerptAr: "",
  coverFileId: null,
  coverAltEn: "",
  coverAltAr: "",
  pinned: false,
});

export const feed = readProcedure
  .input(feedQuerySchema)
  .handler(async ({ input, context }) => ({
    rows: (
      await announcementFeed(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        viewerId: context.actor.userId,
        today: context.today,
        tab: input.tab,
        q: input.q,
      })
    ).map(titled(context)),
    canManage: can(context, "announcements:manage"),
  }));

export const manage = readProcedure
  .input(manageQuerySchema)
  .handler(({ input, context }) => manageKind(context, rules, input));

/** The classes and grades an announcement can go to. */
export const options = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "announcements:manage");
  return audienceChoices(context);
});

export const editor = readProcedure
  .input(v.object({ id }))
  .handler(({ input, context }) => editorOf(context, rules, input.id));

/** One announcement as its reader sees it; those who manage it see who it reached. */
export const record = readProcedure
  .input(v.object({ id }))
  .handler(({ input, context }) => recordOf(context, rules, input.id));

export const save = writeProcedure
  .input(saveAnnouncementSchema)
  .handler(({ input, context }) =>
    saveBroadcast(context, rules, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      primaryLocale: input.primaryLocale,
      body: input.body,
      translation: input.translation,
      audiences: input.audiences,
      fields: fieldsOf(input),
      details: { title: input.titleEn || input.titleAr },
    }),
  );

/**
 * Sends an announcement now or at a set time, fixing who it reaches. Sending
 * an update to one already out replaces what its recipients read and reaches
 * anyone newly in its audience; told, it shows unread again, and quietly it
 * does not.
 */
export const publish = writeProcedure
  .input(publishAnnouncementSchema)
  .handler(({ input, context }) =>
    publishBroadcast(context, rules, {
      id: input.id,
      expectedVersion: input.expectedVersion,
      publishAt: input.publishAt,
      revise: !input.sendUpdate
        ? "refuse"
        : input.quietly
          ? "quietly"
          : "telling",
      check: async (_row, body, other) => {
        const [problem] = await checkWords(context, rules, [body, other], {
          consent: true,
        });
        if (problem)
          throw new ORPCError("BAD_REQUEST", {
            message: CONTENT_ISSUE_CODE[problem],
          });
      },
    }),
  );

export const archive = writeProcedure
  .input(archiveAnnouncementSchema)
  .handler(({ input, context }) => takeDown(context, rules, input, "archived"));

/** A reader opened an announcement, or acknowledged it. */
export const seen = writeProcedure
  .input(seenSchema)
  .handler(({ input, context }) => seenBroadcast(context, rules, input));

/**
 * Records that the translation was checked against the original as it now
 * reads, or takes the check back. Only a written translation can be checked.
 */
export const review = writeProcedure
  .input(reviewTranslationSchema)
  .handler(({ input, context }) => reviewBroadcast(context, rules, input));

/** A new draft with an announcement's settings, audience and both languages as they stand. */
export const duplicate = writeProcedure
  .input(v.object({ id }))
  .handler(({ input, context }) =>
    duplicateBroadcast(context, rules, input.id, (row) =>
      fieldsOf({
        titleEn: row.titleEn,
        titleAr: row.titleAr,
        urgency: row.urgency,
        pinnedUntil: "",
        expiresOn: "",
        requiresAck: row.requiresAck,
        ackDueOn: "",
      }),
    ),
  );
