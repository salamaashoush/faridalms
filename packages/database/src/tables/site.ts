import type { PublishedPicture } from "@faridalms/domain/previews";
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
  fk,
  instant,
  pk,
  roles,
  tenantColumns,
} from "./conventions";
import { files } from "./files";
import { users } from "./people";
import { classes } from "./teaching";
import { orgs, tenants } from "./tenancy";

export type SiteLocale = "en" | "ar";
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
 * `position` order it and `in_menu` hides a page from it. `indexed` false
 * keeps it out of search engines and the sitemap. Its sections are the
 * document hosted as `site_page`, with the other language as that
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
    indexed: boolean("indexed").notNull().default(true),
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
 * An announcement the school puts on its website: the address it reads at,
 * the category visitors find it under, and whether it stands first among
 * the posts. One without a row stays inside the school.
 */
export const sitePosts = core.table.withRLS(
  "site_posts",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    broadcastId: uuid("broadcast_id").notNull(),
    slug: text("slug").notNull(),
    categoryId: uuid("category_id"),
    pinned: boolean("pinned").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("site_posts", t.tenantId, t.id),
    ...baseConstraints("site_posts", t, tenants),
    fk("site_posts", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "site_posts",
      [t.tenantId, t.broadcastId],
      [broadcasts.tenantId, broadcasts.id],
    ),
    fk(
      "site_posts",
      [t.tenantId, t.categoryId],
      [siteCategories.tenantId, siteCategories.id],
    ),
    ck(
      "site_posts",
      "slug",
      sql`char_length(slug) <= 80 and slug ~ ${slugPattern}`,
    ),
    uniqueIndex("site_posts_broadcast_key")
      .on(t.tenantId, t.broadcastId)
      .where(sql`status = 'active'`),
    uniqueIndex("site_posts_slug_key")
      .on(t.tenantId, t.orgId, t.slug)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * An old address of the school's site that visitors and search engines are
 * sent on from, permanently: to a page, followed through renames, or to
 * `to_url`, a path on the site or an address elsewhere. A visitor is sent
 * on only from an address that finds nothing else.
 */
export const siteRedirects = core.table.withRLS(
  "site_redirects",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    fromPath: text("from_path").notNull(),
    toPageId: uuid("to_page_id"),
    toUrl: text("to_url"),
    createdByUserId: uuid("created_by_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("site_redirects", t.tenantId, t.id),
    ...baseConstraints("site_redirects", t, tenants),
    fk("site_redirects", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "site_redirects",
      [t.tenantId, t.toPageId],
      [sitePages.tenantId, sitePages.id],
    ),
    fk(
      "site_redirects",
      [t.tenantId, t.createdByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "site_redirects",
      "from_path",
      sql`char_length(from_path) between 2 and 300 and from_path like '/%' and from_path not like '//%'`,
    ),
    ck("site_redirects", "to_url", sql`char_length(to_url) between 1 and 2048`),
    ck(
      "site_redirects",
      "target",
      sql`(to_page_id is null) <> (to_url is null)`,
    ),
    uniqueIndex("site_redirects_from_key")
      .on(t.tenantId, t.orgId, t.fromPath)
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
    locale: text("locale").$type<SiteLocale>().notNull(),
    slug: text("slug").notNull(),
    parentId: uuid("parent_id"),
    position: smallint("position").notNull(),
    isHome: boolean("is_home").notNull(),
    inMenu: boolean("in_menu").notNull(),
    indexed: boolean("indexed").notNull().default(true),
    title: text("title").notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    media: jsonb("media")
      .$type<Record<string, string>>()
      .notNull()
      .default(sql`'{}'`),
    visibleFrom: instant("visible_from").notNull(),
    /**
     * When a shared section the copy shows last changed it after it was
     * published; null until one does, and again at its next publication.
     */
    revisedAt: instant("revised_at"),
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

/**
 * A class as the school shows it on its website: whether it is shown at
 * all, which it is not until the school says so, and the words a visitor
 * reads in place of its own title and code. Its picture's public copy is
 * `picture_key`, with the sizes made of it in `picture`. A visitor reads
 * these, the class's dates and its teachers' names only through
 * `app.site_classes`, never the class itself.
 */
export const siteClasses = core.table.withRLS(
  "site_classes",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    shown: boolean("shown").notNull().default(false),
    titleEn: text("title_en").notNull().default(""),
    titleAr: text("title_ar").notNull().default(""),
    descriptionEn: text("description_en").notNull().default(""),
    descriptionAr: text("description_ar").notNull().default(""),
    levelEn: text("level_en").notNull().default(""),
    levelAr: text("level_ar").notNull().default(""),
    pictureFileId: uuid("picture_file_id"),
    pictureAltEn: text("picture_alt_en").notNull().default(""),
    pictureAltAr: text("picture_alt_ar").notNull().default(""),
    pictureKey: text("picture_key"),
    picture: jsonb("picture").$type<PublishedPicture>(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("site_classes", t.tenantId, t.id),
    ...baseConstraints("site_classes", t, tenants),
    fk("site_classes", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "site_classes",
      [t.tenantId, t.classId, t.orgId],
      [classes.tenantId, classes.id, classes.orgId],
    ),
    fk(
      "site_classes",
      [t.tenantId, t.pictureFileId],
      [files.tenantId, files.id],
    ),
    ck("site_classes", "title_en", sql`char_length(title_en) <= 120`),
    ck("site_classes", "title_ar", sql`char_length(title_ar) <= 120`),
    ck(
      "site_classes",
      "description_en",
      sql`char_length(description_en) <= 600`,
    ),
    ck(
      "site_classes",
      "description_ar",
      sql`char_length(description_ar) <= 600`,
    ),
    ck("site_classes", "level_en", sql`char_length(level_en) <= 80`),
    ck("site_classes", "level_ar", sql`char_length(level_ar) <= 80`),
    ck(
      "site_classes",
      "picture_alt_en",
      sql`char_length(picture_alt_en) <= 300`,
    ),
    ck(
      "site_classes",
      "picture_alt_ar",
      sql`char_length(picture_alt_ar) <= 300`,
    ),
    ck(
      "site_classes",
      "picture",
      sql`picture is null or jsonb_typeof(picture) = 'object'`,
    ),
    uniqueIndex("site_classes_class_key")
      .on(t.tenantId, t.classId)
      .where(sql`status = 'active'`),
    index("site_classes_shown_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active' and shown`),
    ...entityProfile(),
  ],
);
