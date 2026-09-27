import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { boolean, index, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { AudienceScope } from "./announcements";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  fk,
  instant,
  pk,
  tenantColumns,
} from "./conventions";
import { descriptors } from "./descriptors";
import { users } from "./people";
import { classes } from "./teaching";
import { orgs, tenants } from "./tenancy";

export type NewsletterState = "draft" | "scheduled" | "published" | "archived";
export type NewsletterLocale = "en" | "ar";

/**
 * An edition of the school's newsletter. It is written as the document hosted
 * as `newsletter` in `primary_locale`, with the other language as that
 * document's translation when `bilingual`. Readers see the `publish` version
 * taken when it went out, so later edits stay private until published again.
 */
export const newsletters = core.table.withRLS(
  "newsletters",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    title: text("title").notNull(),
    primaryLocale: text("primary_locale").$type<NewsletterLocale>().notNull(),
    bilingual: boolean("bilingual").notNull().default(false),
    state: text("state").$type<NewsletterState>().notNull().default("draft"),
    publishAt: instant("publish_at"),
    authorUserId: uuid("author_user_id").notNull(),
    /** The last time a changed edition replaced the one readers had. */
    revisedAt: instant("revised_at"),
    /**
     * Who checked the translation against the original, when, and a digest
     * of the original's words then, which tells whether it has changed since.
     */
    translationReviewedAt: instant("translation_reviewed_at"),
    translationReviewedByUserId: uuid("translation_reviewed_by_user_id"),
    translationSourceDigest: text("translation_source_digest"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("newsletters", t.tenantId, t.id),
    ...baseConstraints("newsletters", t, tenants),
    fk("newsletters", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk("newsletters", [t.tenantId, t.authorUserId], [users.tenantId, users.id]),
    fk(
      "newsletters",
      [t.tenantId, t.translationReviewedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "newsletters",
      "translation_review",
      sql`(translation_reviewed_at is null) = (translation_reviewed_by_user_id is null) and (translation_reviewed_at is null) = (translation_source_digest is null)`,
    ),
    ck("newsletters", "title", sql`char_length(title) between 1 and 200`),
    ck("newsletters", "primary_locale", sql`primary_locale in ('en', 'ar')`),
    ck(
      "newsletters",
      "state",
      sql`state in ('draft', 'scheduled', 'published', 'archived')`,
    ),
    ck(
      "newsletters",
      "publish_at",
      sql`(state in ('scheduled', 'published', 'archived')) = (publish_at is not null)`,
    ),
    index("newsletters_org_idx")
      .on(t.tenantId, t.orgId, t.publishAt)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export const newsletterAudiences = core.table.withRLS(
  "newsletter_audiences",
  {
    ...tenantColumns(),
    newsletterId: uuid("newsletter_id").notNull(),
    scope: text("scope").$type<AudienceScope>().notNull(),
    classId: uuid("class_id"),
    gradeDescriptorId: uuid("grade_descriptor_id"),
    gradeNs: text("grade_ns").notNull().default("grade_level"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("newsletter_audiences", t.tenantId, t.id),
    ...baseConstraints("newsletter_audiences", t, tenants),
    fk(
      "newsletter_audiences",
      [t.tenantId, t.newsletterId],
      [newsletters.tenantId, newsletters.id],
    ),
    fk(
      "newsletter_audiences",
      [t.tenantId, t.classId],
      [classes.tenantId, classes.id],
    ),
    fk(
      "newsletter_audiences",
      [t.tenantId, t.gradeDescriptorId, t.gradeNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    ck(
      "newsletter_audiences",
      "scope",
      sql`scope in ('school', 'staff', 'families', 'students', 'class', 'grade')`,
    ),
    ck("newsletter_audiences", "grade_ns", sql`grade_ns = 'grade_level'`),
    ck(
      "newsletter_audiences",
      "target",
      sql`(scope = 'class') = (class_id is not null) and (scope = 'grade') = (grade_descriptor_id is not null)`,
    ),
    index("newsletter_audiences_newsletter_idx")
      .on(t.tenantId, t.newsletterId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/** Who an edition reached, and when they opened it. */
export const newsletterRecipients = core.table.withRLS(
  "newsletter_recipients",
  {
    ...tenantColumns(),
    newsletterId: uuid("newsletter_id").notNull(),
    userId: uuid("user_id").notNull(),
    readAt: instant("read_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("newsletter_recipients", t.tenantId, t.id),
    ...baseConstraints("newsletter_recipients", t, tenants),
    fk(
      "newsletter_recipients",
      [t.tenantId, t.newsletterId],
      [newsletters.tenantId, newsletters.id],
    ),
    fk(
      "newsletter_recipients",
      [t.tenantId, t.userId],
      [users.tenantId, users.id],
    ),
    uniqueIndex("newsletter_recipients_key")
      .on(t.tenantId, t.newsletterId, t.userId)
      .where(sql`status = 'active'`),
    index("newsletter_recipients_user_idx")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
