import type {
  CloseReason,
  EnquiryAnswer,
  EnquiryPurpose,
  EnquirySource,
  EnquiryState,
} from "@faridalms/domain/enquiries";
import type { SiteChrome, SiteTheme } from "@faridalms/domain/site-theme";
import type { SocialLink } from "@faridalms/domain/website";
import type { SQL } from "drizzle-orm";
import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgPolicy,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { broadcasts } from "./broadcasts";
import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  erase,
  erasureListed,
  fk,
  instant,
  ledgerProfile,
  pk,
  roles,
  tenantColumns,
} from "./conventions";
import { users } from "./people";
import { orgs, tenants } from "./tenancy";

export type SiteLocale = "en" | "ar";
export type PageKind = "site" | "portal";
export type PostVisibility = "public" | "school";
export type SiteState = "draft" | "published" | "archived";
export type BannerTone = "info" | "warning" | "danger";
export type { SocialLink };

export const slugPattern = sql`'^[a-z0-9]+(-[a-z0-9]+)*$'`;

/** What the public website may read of a row: live ones only. */
const siteRead = (extra?: SQL) =>
  pgPolicy("p_site_select", {
    for: "select",
    to: roles.site,
    using: extra ? sql`status = 'active' and ${extra}` : sql`status = 'active'`,
  });

/**
 * A school's website as a whole: whether it is live, whether it speaks the
 * school's other language too, the line under its name, its social links and
 * the banner shown on every page until `banner_until`, for closures and the
 * like. Its first language and its logo are the school's own, on `orgs`.
 */
export const siteSettings = core.table.withRLS(
  "site_settings",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    live: boolean("live").notNull().default(false),
    bilingual: boolean("bilingual").notNull().default(true),
    taglineEn: text("tagline_en").notNull().default(""),
    taglineAr: text("tagline_ar").notNull().default(""),
    socialLinks: jsonb("social_links")
      .$type<SocialLink[]>()
      .notNull()
      .default(sql`'[]'`),
    bannerEn: text("banner_en").notNull().default(""),
    bannerAr: text("banner_ar").notNull().default(""),
    bannerTone: text("banner_tone")
      .$type<BannerTone>()
      .notNull()
      .default("info"),
    bannerUntil: instant("banner_until"),
    theme: jsonb("theme")
      .$type<SiteTheme>()
      .notNull()
      .default(sql`'{}'`),
    chrome: jsonb("chrome")
      .$type<SiteChrome>()
      .notNull()
      .default(sql`'{}'`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("site_settings", t.tenantId, t.id),
    ...baseConstraints("site_settings", t, tenants),
    fk("site_settings", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("site_settings", "tagline_en", sql`char_length(tagline_en) <= 200`),
    ck("site_settings", "tagline_ar", sql`char_length(tagline_ar) <= 200`),
    ck(
      "site_settings",
      "social_links",
      sql`jsonb_typeof(social_links) = 'array' and jsonb_array_length(social_links) <= 10`,
    ),
    ck("site_settings", "banner_en", sql`char_length(banner_en) <= 300`),
    ck("site_settings", "banner_ar", sql`char_length(banner_ar) <= 300`),
    ck(
      "site_settings",
      "banner_tone",
      sql`banner_tone in ('info', 'warning', 'danger')`,
    ),
    ck(
      "site_settings",
      "theme",
      sql`jsonb_typeof(theme) = 'object' and octet_length(theme::text) <= 8192`,
    ),
    ck(
      "site_settings",
      "chrome",
      sql`jsonb_typeof(chrome) = 'object' and octet_length(chrome::text) <= 65536`,
    ),
    uniqueIndex("site_settings_org_key")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    siteRead(),
  ],
);

/**
 * A page of the website. The page tree is the site's menu: `parent_id` and
 * `position` order it and `in_menu` hides a page from it. Its sections are
 * the document hosted as `site_page`, with the other language as that
 * document's translation. Visitors read the copy in `site_published_pages`,
 * so edits after publishing stay private; `revised_at` marks those edits.
 */
export const sitePages = core.table.withRLS(
  "site_pages",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    kind: text("kind").$type<PageKind>().notNull().default("site"),
    parentId: uuid("parent_id"),
    position: smallint("position").notNull().default(0),
    slug: text("slug").notNull(),
    isHome: boolean("is_home").notNull().default(false),
    inMenu: boolean("in_menu").notNull().default(true),
    titleEn: text("title_en").notNull().default(""),
    titleAr: text("title_ar").notNull().default(""),
    state: text("state").$type<SiteState>().notNull().default("draft"),
    publishedAt: instant("published_at"),
    revisedAt: instant("revised_at"),
    authorUserId: uuid("author_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("site_pages", t.tenantId, t.id),
    ...baseConstraints("site_pages", t, tenants),
    fk("site_pages", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk("site_pages", [t.tenantId, t.parentId], [t.tenantId, t.id]),
    fk("site_pages", [t.tenantId, t.authorUserId], [users.tenantId, users.id]),
    ck("site_pages", "parent", sql`parent_id is null or parent_id <> id`),
    ck("site_pages", "position", sql`position between 0 and 999`),
    ck(
      "site_pages",
      "slug",
      sql`char_length(slug) <= 80 and slug ~ ${slugPattern}`,
    ),
    ck(
      "site_pages",
      "title",
      sql`char_length(title_en) <= 200 and char_length(title_ar) <= 200 and (title_en <> '' or title_ar <> '')`,
    ),
    ck("site_pages", "state", sql`state in ('draft', 'published', 'archived')`),
    ck(
      "site_pages",
      "published_at",
      sql`(state = 'published') = (published_at is not null)`,
    ),
    ck("site_pages", "home", sql`not is_home or parent_id is null`),
    ck("site_pages", "kind", sql`kind in ('site', 'portal')`),
    ck(
      "site_pages",
      "portal",
      sql`kind = 'site' or (not is_home and not in_menu and parent_id is null)`,
    ),
    // A portal page is one of the portal's doors, at the door's own address;
    // the slug key keeps each door to one page.
    ck(
      "site_pages",
      "door",
      sql`kind = 'site' or slug in ('sign-in', 'register', 'apply')`,
    ),
    uniqueIndex("site_pages_slug_key")
      .on(t.tenantId, t.orgId, t.kind, t.slug)
      .where(sql`status = 'active'`),
    uniqueIndex("site_pages_home_key")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active' and is_home`),
    index("site_pages_tree_idx")
      .on(t.tenantId, t.orgId, t.parentId, t.position)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/** How posts are grouped on the site; visitors filter the news by them. */
export const siteCategories = core.table.withRLS(
  "site_categories",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    slug: text("slug").notNull(),
    nameEn: text("name_en").notNull().default(""),
    nameAr: text("name_ar").notNull().default(""),
    position: smallint("position").notNull().default(0),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("site_categories", t.tenantId, t.id),
    ...baseConstraints("site_categories", t, tenants),
    fk("site_categories", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck(
      "site_categories",
      "slug",
      sql`char_length(slug) <= 80 and slug ~ ${slugPattern}`,
    ),
    ck(
      "site_categories",
      "name",
      sql`char_length(name_en) <= 100 and char_length(name_ar) <= 100 and (name_en <> '' or name_ar <> '')`,
    ),
    ck("site_categories", "position", sql`position between 0 and 999`),
    uniqueIndex("site_categories_slug_key")
      .on(t.tenantId, t.orgId, t.slug)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    siteRead(),
  ],
);

const visible = sql`visible_from <= statement_timestamp()`;

/**
 * A page as visitors read it in one language, written when it is published.
 * `content` is the page's sections in that language; `media` maps each file
 * it shows to that file's public key. A scheduled page waits for
 * `visible_from`.
 */
export const sitePublishedPages = core.table.withRLS(
  "site_published_pages",
  {
    ...tenantColumns(),
    pageId: uuid("page_id").notNull(),
    orgId: uuid("org_id").notNull(),
    kind: text("kind").$type<PageKind>().notNull().default("site"),
    locale: text("locale").$type<SiteLocale>().notNull(),
    slug: text("slug").notNull(),
    parentId: uuid("parent_id"),
    position: smallint("position").notNull(),
    isHome: boolean("is_home").notNull(),
    inMenu: boolean("in_menu").notNull(),
    title: text("title").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    media: jsonb("media")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'`),
    visibleFrom: instant("visible_from").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("site_published_pages", t.tenantId, t.id),
    ...baseConstraints("site_published_pages", t, tenants),
    fk(
      "site_published_pages",
      [t.tenantId, t.pageId],
      [sitePages.tenantId, sitePages.id],
    ),
    fk("site_published_pages", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("site_published_pages", "locale", sql`locale in ('en', 'ar')`),
    ck("site_published_pages", "kind", sql`kind in ('site', 'portal')`),
    ck(
      "site_published_pages",
      "title",
      sql`char_length(title) between 1 and 200`,
    ),
    ck(
      "site_published_pages",
      "content",
      sql`jsonb_typeof(content) = 'object' and octet_length(content::text) <= 1048576`,
    ),
    ck("site_published_pages", "media", sql`jsonb_typeof(media) = 'object'`),
    uniqueIndex("site_published_pages_key")
      .on(t.tenantId, t.pageId, t.locale)
      .where(sql`status = 'active'`),
    index("site_published_pages_slug_idx")
      .on(t.tenantId, t.orgId, t.locale, t.slug)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    siteRead(visible),
  ],
);

/** A post as visitors read it in one language, written when it is published. */
export const sitePublishedPosts = core.table.withRLS(
  "site_published_posts",
  {
    ...tenantColumns(),
    postId: uuid("post_id").notNull(),
    orgId: uuid("org_id").notNull(),
    locale: text("locale").$type<SiteLocale>().notNull(),
    slug: text("slug").notNull(),
    categoryId: uuid("category_id"),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    coverKey: text("cover_key"),
    coverAlt: text("cover_alt").notNull().default(""),
    pinned: boolean("pinned").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    media: jsonb("media")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'`),
    visibleFrom: instant("visible_from").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("site_published_posts", t.tenantId, t.id),
    ...baseConstraints("site_published_posts", t, tenants),
    fk(
      "site_published_posts",
      [t.tenantId, t.postId],
      [broadcasts.tenantId, broadcasts.id],
    ),
    fk("site_published_posts", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "site_published_posts",
      [t.tenantId, t.categoryId],
      [siteCategories.tenantId, siteCategories.id],
    ),
    ck("site_published_posts", "locale", sql`locale in ('en', 'ar')`),
    ck(
      "site_published_posts",
      "title",
      sql`char_length(title) between 1 and 200`,
    ),
    ck(
      "site_published_posts",
      "content",
      sql`jsonb_typeof(content) = 'object' and octet_length(content::text) <= 1048576`,
    ),
    ck("site_published_posts", "media", sql`jsonb_typeof(media) = 'object'`),
    uniqueIndex("site_published_posts_key")
      .on(t.tenantId, t.postId, t.locale)
      .where(sql`status = 'active'`),
    index("site_published_posts_org_idx")
      .on(t.tenantId, t.orgId, t.locale, t.visibleFrom)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    siteRead(visible),
  ],
);

export type {
  CloseReason,
  EnquiryAnswer,
  EnquiryPurpose,
  EnquirySource,
  EnquiryState,
} from "@faridalms/domain/enquiries";

/**
 * A family's enquiry, from whichever door it came in: a form on the website,
 * or a call, a visit, an event or a referral that staff logged. It is worked
 * from open to converted or closed, and later links to the family and the
 * applicant it became. The site role may only add rows from a form, unworked
 * and unassigned; it reads nothing back but the network key and time it
 * needs to slow down a flood from one place.
 */
export const siteEnquiries = core.table.withRLS(
  "site_enquiries",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    source: text("source").$type<EnquirySource>().notNull().default("website"),
    pageId: uuid("page_id"),
    sectionId: uuid("section_id"),
    locale: text("locale").$type<SiteLocale>().notNull(),
    purpose: text("purpose").$type<EnquiryPurpose>().notNull(),
    name: text("name").notNull(),
    email: text("email").notNull().default(""),
    phone: text("phone").notNull().default(""),
    // The phone in E.164 when it reads as a number of the school's country
    // or an international one, so a family's other enquiries are found by it.
    phoneNormalized: text("phone_normalized"),
    childName: text("child_name").notNull().default(""),
    childYear: text("child_year").notNull().default(""),
    message: text("message").notNull().default(""),
    answers: jsonb("answers")
      .$type<EnquiryAnswer[]>()
      .notNull()
      .default(sql`'[]'`),
    networkKey: text("network_key").notNull().default(""),
    state: text("state").$type<EnquiryState>().notNull().default("open"),
    stateChangedAt: instant("state_changed_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    closedReason: text("closed_reason").$type<CloseReason>(),
    // These four reference users through keys the access migration adds NOT
    // VALID: drizzle-kit 1.0.0-rc.5 writes a key on an existing table as
    // validated, and validating one reads the table under its forced row
    // security, where a migration has no tenant. New rows are checked.
    assigneeUserId: uuid("assignee_user_id"),
    firstRespondedAt: instant("first_responded_at"),
    createdByUserId: uuid("created_by_user_id"),
    familyUserId: uuid("family_user_id"),
    applicantUserId: uuid("applicant_user_id"),
    // The enquiry's conversation in the admissions mailbox, where the family
    // is written to and every note, contact and change is kept. Keyed NOT
    // VALID by the custom migration, for the reason above.
    threadId: uuid("thread_id"),
    // What the release before the enquiry's states reads and writes; nothing
    // here does, and the columns go once no such release runs.
    handledAt: instant("handled_at"),
    handledBy: uuid("handled_by"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("site_enquiries", t.tenantId, t.id),
    ...baseConstraints("site_enquiries", t, tenants),
    fk("site_enquiries", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk("site_enquiries", [t.tenantId, t.handledBy], [users.tenantId, users.id]),
    ck(
      "site_enquiries",
      "source",
      sql`source in ('website', 'phone', 'email', 'walk_in', 'event', 'referral', 'other')`,
    ),
    ck("site_enquiries", "locale", sql`locale in ('en', 'ar')`),
    ck(
      "site_enquiries",
      "purpose",
      sql`purpose in ('enquiry', 'visit', 'general')`,
    ),
    ck("site_enquiries", "name", sql`char_length(name) between 1 and 120`),
    ck(
      "site_enquiries",
      "email",
      sql`email = '' or (char_length(email) between 3 and 254 and email like '%_@_%')`,
    ),
    ck("site_enquiries", "phone", sql`char_length(phone) <= 40`),
    ck(
      "site_enquiries",
      "phone_normalized",
      sql`phone_normalized ~ '^\\+[1-9][0-9]{6,14}$'`,
    ),
    ck(
      "site_enquiries",
      "reach",
      sql`status = 'tobedeleted' or email <> '' or phone <> ''`,
    ),
    ck("site_enquiries", "child_name", sql`char_length(child_name) <= 120`),
    ck("site_enquiries", "child_year", sql`char_length(child_year) <= 60`),
    ck("site_enquiries", "message", sql`char_length(message) <= 2000`),
    ck(
      "site_enquiries",
      "answers",
      sql`jsonb_typeof(answers) = 'array' and octet_length(answers::text) <= 32768`,
    ),
    ck("site_enquiries", "network_key", sql`char_length(network_key) <= 128`),
    ck(
      "site_enquiries",
      "state",
      sql`state in ('open', 'in_progress', 'converted', 'closed')`,
    ),
    ck(
      "site_enquiries",
      "closed_reason",
      sql`closed_reason in ('answered', 'not_interested', 'another_school', 'not_eligible', 'no_places', 'no_response', 'duplicate', 'spam', 'other')`,
    ),
    ck(
      "site_enquiries",
      "closed",
      sql`(state = 'closed') = (closed_reason is not null)`,
    ),
    ck(
      "site_enquiries",
      "website",
      sql`(source = 'website') = (created_by_user_id is null)`,
    ),
    ck(
      "site_enquiries",
      "handled",
      sql`(handled_at is null) = (handled_by is null)`,
    ),
    index("site_enquiries_org_idx")
      .on(t.tenantId, t.orgId, t.createdAt)
      .where(sql`status = 'active'`),
    index("site_enquiries_state_idx")
      .on(t.tenantId, t.orgId, t.state, t.createdAt)
      .where(sql`status = 'active'`),
    index("site_enquiries_assignee_idx")
      .on(t.tenantId, t.assigneeUserId, t.state)
      .where(sql`status = 'active' and assignee_user_id is not null`),
    index("site_enquiries_email_idx")
      .on(t.tenantId, t.orgId, sql`lower(email)`)
      .where(sql`status = 'active' and email <> ''`),
    index("site_enquiries_network_idx")
      .on(t.tenantId, t.networkKey, t.createdAt)
      .where(sql`status = 'active'`),
    index("site_enquiries_phone_idx")
      .on(t.tenantId, t.orgId, t.phoneNormalized)
      .where(sql`status = 'active' and phone_normalized is not null`),
    uniqueIndex("site_enquiries_thread_key")
      .on(t.tenantId, t.threadId)
      .where(sql`thread_id is not null`),
    ...entityProfile(),
    ...erase(erasureListed("site_enquiry", "id")),
    pgPolicy("p_site_insert", {
      for: "insert",
      to: roles.site,
      withCheck: sql`status = 'active' and source = 'website' and state = 'open'
        and closed_reason is null and assignee_user_id is null and first_responded_at is null
        and created_by_user_id is null and family_user_id is null and applicant_user_id is null
        and thread_id is null and handled_at is null`,
    }),
    pgPolicy("p_site_select", {
      for: "select",
      to: roles.site,
      using: sql`status = 'active' and created_at > statement_timestamp() - interval '1 day'`,
    }),
  ],
);

type LegacyEntryKind =
  | "note"
  | "call"
  | "email"
  | "meeting"
  | "reply"
  | "state"
  | "assigned";

/**
 * What an enquiry's thread held before it became a conversation in the
 * admissions mailbox. The move copied every row into the conversation and
 * nothing reads or writes here; the table goes once no release that wrote
 * it runs, after a last copy of anything such a release added meanwhile.
 */
export const siteEnquiryEntries = core.table.withRLS(
  "site_enquiry_entries",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    enquiryId: uuid("enquiry_id").notNull(),
    kind: text("kind").$type<LegacyEntryKind>().notNull(),
    body: text("body").notNull().default(""),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    authorUserId: uuid("author_user_id"),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("site_enquiry_entries", t.tenantId, t.id),
    fk("site_enquiry_entries", [t.tenantId], [tenants.tenantId]),
    fk("site_enquiry_entries", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "site_enquiry_entries",
      [t.tenantId, t.enquiryId],
      [siteEnquiries.tenantId, siteEnquiries.id],
    ),
    fk(
      "site_enquiry_entries",
      [t.tenantId, t.authorUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "site_enquiry_entries",
      "kind",
      sql`kind in ('note', 'call', 'email', 'meeting', 'reply', 'state', 'assigned')`,
    ),
    ck("site_enquiry_entries", "body", sql`char_length(body) <= 5200`),
    ck(
      "site_enquiry_entries",
      "details",
      sql`jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096`,
    ),
    index("site_enquiry_entries_enquiry_idx").on(
      t.tenantId,
      t.enquiryId,
      t.createdAt,
    ),
    ...ledgerProfile(),
  ],
);
