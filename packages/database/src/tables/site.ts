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

import { announcements } from "./announcements";
import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  fk,
  instant,
  pk,
  roles,
  tenantColumns,
} from "./conventions";
import { files } from "./files";
import { users } from "./people";
import { orgs, tenants } from "./tenancy";

export type SiteLocale = "en" | "ar";
export type SiteState = "draft" | "published" | "archived";
export type BannerTone = "info" | "warning" | "danger";
export type { SocialLink };

const slugPattern = sql`'^[a-z0-9]+(-[a-z0-9]+)*$'`;

/** What the public website may read of a row: live ones only. */
const siteRead = (extra?: SQL) =>
  pgPolicy("p_site_select", {
    for: "select",
    to: roles.site,
    using: extra ? sql`status = 'active' and ${extra}` : sql`status = 'active'`,
  });

/**
 * A school's website as a whole: whether it is live, its languages, the line
 * under its name, its social links and the banner shown on every page until
 * `banner_until`, for closures and the like.
 */
export const siteSettings = core.table.withRLS(
  "site_settings",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    live: boolean("live").notNull().default(false),
    primaryLocale: text("primary_locale")
      .$type<SiteLocale>()
      .notNull()
      .default("en"),
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
    ck("site_settings", "primary_locale", sql`primary_locale in ('en', 'ar')`),
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
    uniqueIndex("site_pages_slug_key")
      .on(t.tenantId, t.orgId, t.slug)
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

/**
 * A news post. Its body is the document hosted as `site_post`, with the
 * other language as its translation; `announcement_id` is the announcement
 * sent with it to the school when the author asked for one.
 */
export const sitePosts = core.table.withRLS(
  "site_posts",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    categoryId: uuid("category_id"),
    slug: text("slug").notNull(),
    titleEn: text("title_en").notNull().default(""),
    titleAr: text("title_ar").notNull().default(""),
    excerptEn: text("excerpt_en").notNull().default(""),
    excerptAr: text("excerpt_ar").notNull().default(""),
    coverFileId: uuid("cover_file_id"),
    coverAltEn: text("cover_alt_en").notNull().default(""),
    coverAltAr: text("cover_alt_ar").notNull().default(""),
    pinned: boolean("pinned").notNull().default(false),
    state: text("state").$type<SiteState>().notNull().default("draft"),
    publishedAt: instant("published_at"),
    revisedAt: instant("revised_at"),
    announcementId: uuid("announcement_id"),
    authorUserId: uuid("author_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("site_posts", t.tenantId, t.id),
    ...baseConstraints("site_posts", t, tenants),
    fk("site_posts", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "site_posts",
      [t.tenantId, t.categoryId],
      [siteCategories.tenantId, siteCategories.id],
    ),
    fk("site_posts", [t.tenantId, t.coverFileId], [files.tenantId, files.id]),
    fk(
      "site_posts",
      [t.tenantId, t.announcementId],
      [announcements.tenantId, announcements.id],
    ),
    fk("site_posts", [t.tenantId, t.authorUserId], [users.tenantId, users.id]),
    ck(
      "site_posts",
      "slug",
      sql`char_length(slug) <= 80 and slug ~ ${slugPattern}`,
    ),
    ck(
      "site_posts",
      "title",
      sql`char_length(title_en) <= 200 and char_length(title_ar) <= 200 and (title_en <> '' or title_ar <> '')`,
    ),
    ck(
      "site_posts",
      "excerpt",
      sql`char_length(excerpt_en) <= 300 and char_length(excerpt_ar) <= 300`,
    ),
    ck(
      "site_posts",
      "cover_alt",
      sql`char_length(cover_alt_en) <= 300 and char_length(cover_alt_ar) <= 300`,
    ),
    ck("site_posts", "state", sql`state in ('draft', 'published', 'archived')`),
    ck(
      "site_posts",
      "published_at",
      sql`(state = 'published') = (published_at is not null)`,
    ),
    uniqueIndex("site_posts_slug_key")
      .on(t.tenantId, t.orgId, t.slug)
      .where(sql`status = 'active'`),
    index("site_posts_org_idx")
      .on(t.tenantId, t.orgId, t.publishedAt)
      .where(sql`status = 'active'`),
    ...entityProfile(),
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
      [sitePosts.tenantId, sitePosts.id],
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

export type EnquiryPurpose = "enquiry" | "visit" | "general";

/**
 * A message a visitor sent from a form on the public website. The site role
 * may only add rows; it reads nothing back but the network key and time it
 * needs to slow down a flood from one place.
 */
export const siteEnquiries = core.table.withRLS(
  "site_enquiries",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    pageId: uuid("page_id"),
    sectionId: uuid("section_id"),
    locale: text("locale").$type<SiteLocale>().notNull(),
    purpose: text("purpose").$type<EnquiryPurpose>().notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull().default(""),
    childYear: text("child_year").notNull().default(""),
    message: text("message").notNull().default(""),
    networkKey: text("network_key").notNull().default(""),
    handledAt: instant("handled_at"),
    handledBy: uuid("handled_by"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("site_enquiries", t.tenantId, t.id),
    ...baseConstraints("site_enquiries", t, tenants),
    fk("site_enquiries", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk("site_enquiries", [t.tenantId, t.handledBy], [users.tenantId, users.id]),
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
      sql`char_length(email) between 3 and 254 and email like '%_@_%'`,
    ),
    ck("site_enquiries", "phone", sql`char_length(phone) <= 40`),
    ck("site_enquiries", "child_year", sql`char_length(child_year) <= 60`),
    ck("site_enquiries", "message", sql`char_length(message) <= 2000`),
    ck("site_enquiries", "network_key", sql`char_length(network_key) <= 128`),
    ck(
      "site_enquiries",
      "handled",
      sql`(handled_at is null) = (handled_by is null)`,
    ),
    index("site_enquiries_org_idx")
      .on(t.tenantId, t.orgId, t.createdAt)
      .where(sql`status = 'active'`),
    index("site_enquiries_network_idx")
      .on(t.tenantId, t.networkKey, t.createdAt)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    pgPolicy("p_site_insert", {
      for: "insert",
      to: roles.site,
      withCheck: sql`status = 'active' and handled_at is null`,
    }),
    pgPolicy("p_site_select", {
      for: "select",
      to: roles.site,
      using: sql`status = 'active' and created_at > statement_timestamp() - interval '1 day'`,
    }),
  ],
);
