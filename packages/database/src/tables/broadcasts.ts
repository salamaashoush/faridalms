import type {
  AudienceScope,
  Urgency,
  Visibility,
} from "@faridalms/domain/announcements";
import type { PublicationState } from "@faridalms/domain/publication";
import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  eraseAndDelete,
  erasureOf,
  fk,
  instant,
  pk,
  tenantColumns,
} from "./conventions";
import { files } from "./files";
import { users } from "./people";
import { siteCategories, slugPattern } from "./site";
import { classes } from "./teaching";
import { orgs, tenants } from "./tenancy";

export type { AudienceScope, PublicationState, Urgency, Visibility };

/**
 * An announcement: what the school sends to its audience, which can ask to
 * be acknowledged, and can also be on the website with an address, a
 * category and a cover. Its words are the document hosted as
 * `announcement`, with the other language as its translation. It is
 * scheduled while published with `publish_at` still to come, and `told_at`
 * records when its readers were told it is out.
 */
export const broadcasts = core.table.withRLS(
  "broadcasts",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    titleEn: text("title_en").notNull().default(""),
    titleAr: text("title_ar").notNull().default(""),
    state: text("state").$type<PublicationState>().notNull().default("draft"),
    publishAt: instant("publish_at"),
    toldAt: instant("told_at"),
    /** One on the website is public; otherwise it reaches only its audience. */
    visibility: text("visibility")
      .$type<Visibility>()
      .notNull()
      .default("school"),
    authorUserId: uuid("author_user_id").notNull(),
    /**
     * Who checked the translation against the original, when, and a digest
     * of the original's words then, which tells whether it has changed since.
     */
    translationReviewedAt: instant("translation_reviewed_at"),
    translationReviewedByUserId: uuid("translation_reviewed_by_user_id"),
    translationSourceDigest: text("translation_source_digest"),
    urgency: text("urgency").$type<Urgency>().notNull().default("normal"),
    pinnedUntil: date("pinned_until", { mode: "string" }),
    expiresOn: date("expires_on", { mode: "string" }),
    requiresAck: boolean("requires_ack").notNull().default(false),
    ackDueOn: date("ack_due_on", { mode: "string" }),
    /** The last time an edit was sent to recipients again rather than made quietly. */
    updateSentAt: instant("update_sent_at"),
    categoryId: uuid("category_id"),
    slug: text("slug"),
    excerptEn: text("excerpt_en").notNull().default(""),
    excerptAr: text("excerpt_ar").notNull().default(""),
    coverFileId: uuid("cover_file_id"),
    coverAltEn: text("cover_alt_en").notNull().default(""),
    coverAltAr: text("cover_alt_ar").notNull().default(""),
    pinned: boolean("pinned").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("broadcasts", t.tenantId, t.id),
    ...baseConstraints("broadcasts", t, tenants),
    fk("broadcasts", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk("broadcasts", [t.tenantId, t.authorUserId], [users.tenantId, users.id]),
    fk(
      "broadcasts",
      [t.tenantId, t.translationReviewedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "broadcasts",
      [t.tenantId, t.categoryId],
      [siteCategories.tenantId, siteCategories.id],
    ),
    fk("broadcasts", [t.tenantId, t.coverFileId], [files.tenantId, files.id]),
    ck("broadcasts", "state", sql`state in ('draft', 'published', 'archived')`),
    ck(
      "broadcasts",
      "publish_at",
      sql`(state <> 'published' or publish_at is not null) and (state <> 'draft' or publish_at is null)`,
    ),
    ck("broadcasts", "told_at", sql`told_at is null or state <> 'draft'`),
    ck("broadcasts", "visibility", sql`visibility in ('public', 'school')`),
    ck(
      "broadcasts",
      "title",
      sql`char_length(title_en) <= 200 and char_length(title_ar) <= 200 and (title_en <> '' or title_ar <> '')`,
    ),
    ck(
      "broadcasts",
      "translation_review",
      sql`(translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null)`,
    ),
    ck(
      "broadcasts",
      "urgency",
      sql`urgency in ('normal', 'important', 'urgent')`,
    ),
    ck("broadcasts", "ack_due_on", sql`ack_due_on is null or requires_ack`),
    ck("broadcasts", "website", sql`visibility = 'school' or slug is not null`),
    ck(
      "broadcasts",
      "slug",
      sql`slug is null or (char_length(slug) <= 80 and slug ~ ${slugPattern})`,
    ),
    ck(
      "broadcasts",
      "excerpt",
      sql`char_length(excerpt_en) <= 300 and char_length(excerpt_ar) <= 300`,
    ),
    ck(
      "broadcasts",
      "cover_alt",
      sql`char_length(cover_alt_en) <= 300 and char_length(cover_alt_ar) <= 300`,
    ),
    uniqueIndex("broadcasts_slug_key")
      .on(t.tenantId, t.orgId, t.slug)
      .where(sql`status = 'active' and slug is not null`),
    index("broadcasts_org_idx")
      .on(t.tenantId, t.orgId, t.publishAt)
      .where(sql`status = 'active'`),
    index("broadcasts_untold_idx")
      .on(t.tenantId, t.publishAt)
      .where(
        sql`status = 'active' and state = 'published' and told_at is null`,
      ),
    ...entityProfile(),
  ],
);

/** Who a broadcast is for, resolved to people when it goes out. */
export const broadcastAudiences = core.table.withRLS(
  "broadcast_audiences",
  {
    ...tenantColumns(),
    broadcastId: uuid("broadcast_id").notNull(),
    scope: text("scope").$type<AudienceScope>().notNull(),
    classId: uuid("class_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("broadcast_audiences", t.tenantId, t.id),
    ...baseConstraints("broadcast_audiences", t, tenants),
    fk(
      "broadcast_audiences",
      [t.tenantId, t.broadcastId],
      [broadcasts.tenantId, broadcasts.id],
    ),
    fk(
      "broadcast_audiences",
      [t.tenantId, t.classId],
      [classes.tenantId, classes.id],
    ),
    ck(
      "broadcast_audiences",
      "scope",
      sql`scope in ('school', 'staff', 'families', 'students', 'class')`,
    ),
    ck(
      "broadcast_audiences",
      "target",
      sql`(scope = 'class') = (class_id is not null)`,
    ),
    index("broadcast_audiences_broadcast_idx")
      .on(t.tenantId, t.broadcastId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/** Who a broadcast reached, and when each read it and, where asked, acknowledged it. */
export const broadcastRecipients = core.table.withRLS(
  "broadcast_recipients",
  {
    ...tenantColumns(),
    broadcastId: uuid("broadcast_id").notNull(),
    userId: uuid("user_id").notNull(),
    readAt: instant("read_at"),
    acknowledgedAt: instant("acknowledged_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("broadcast_recipients", t.tenantId, t.id),
    ...baseConstraints("broadcast_recipients", t, tenants),
    fk(
      "broadcast_recipients",
      [t.tenantId, t.broadcastId],
      [broadcasts.tenantId, broadcasts.id],
    ),
    fk(
      "broadcast_recipients",
      [t.tenantId, t.userId],
      [users.tenantId, users.id],
    ),
    uniqueIndex("broadcast_recipients_key")
      .on(t.tenantId, t.broadcastId, t.userId)
      .where(sql`status = 'active'`),
    index("broadcast_recipients_user_idx")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active'`),
    ...eraseAndDelete(erasureOf("user_id")),
    ...entityProfile(),
  ],
);
