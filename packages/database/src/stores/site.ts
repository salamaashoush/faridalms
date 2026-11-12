import type { PublishedPicture } from "@faridalms/domain/previews";
import type { FormAnswer } from "@faridalms/domain/questions";
import type { SiteChrome, SiteTheme } from "@faridalms/domain/site-theme";

import { publishedPicture } from "@faridalms/domain/previews";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type {
  BannerTone,
  EnquiryPurpose,
  SiteLocale,
  SiteState,
  SocialLink,
} from "../tables/site";
import type { PostalAddress } from "../tables/tenancy";

import { isoOf, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface SettingsRow {
  id: string;
  version: number;
  live: boolean;
  /** The school's own language, which the website is written in first. */
  primaryLocale: SiteLocale;
  bilingual: boolean;
  taglineEn: string;
  taglineAr: string;
  socialLinks: SocialLink[];
  bannerEn: string;
  bannerAr: string;
  bannerTone: BannerTone;
  bannerUntil: string | null;
  theme: SiteTheme;
  chrome: SiteChrome;
}

type SettingsRecord = {
  id: string;
  version: number;
  live: boolean;
  primary_locale: SiteLocale;
  bilingual: boolean;
  tagline_en: string;
  tagline_ar: string;
  social_links: SocialLink[];
  banner_en: string;
  banner_ar: string;
  banner_tone: BannerTone;
  banner_until: string | null;
  theme: SiteTheme;
  chrome: SiteChrome;
};

const settingsColumns = sql`s.id, s.version, s.live, o.default_locale as primary_locale, s.bilingual,
  s.tagline_en, s.tagline_ar, s.social_links, s.banner_en, s.banner_ar, s.banner_tone,
  ${isoOf(sql`s.banner_until`)} as banner_until, s.theme, s.chrome`;

function settingsOf(row: SettingsRecord): SettingsRow {
  return {
    id: row.id,
    version: row.version,
    live: row.live,
    primaryLocale: row.primary_locale,
    bilingual: row.bilingual,
    taglineEn: row.tagline_en,
    taglineAr: row.tagline_ar,
    socialLinks: row.social_links,
    bannerEn: row.banner_en,
    bannerAr: row.banner_ar,
    bannerTone: row.banner_tone,
    bannerUntil: row.banner_until,
    theme: row.theme,
    chrome: row.chrome,
  };
}

/** A school's website settings; the site role reads them too. */
export async function siteSettings(
  tx: Tx,
  tenantId: string,
  orgId: string,
): Promise<SettingsRow | null> {
  const [row] = await tx.execute<SettingsRecord>(sql`
    select ${settingsColumns} from core.site_settings s
    join core.orgs o on o.tenant_id = s.tenant_id and o.id = s.org_id
    where s.tenant_id = ${tenantId}::uuid and s.org_id = ${orgId}::uuid and s.status = 'active'`);
  return row ? settingsOf(row) : null;
}

export type SettingsFields = Omit<
  SettingsRow,
  "id" | "version" | "primaryLocale"
>;

/** Writes the settings, creating them the first time; null when someone saved first. */
export async function saveSiteSettings(
  tx: Tx,
  input: SettingsFields & {
    tenantId: string;
    orgId: string;
    expectedVersion: number;
  },
): Promise<number | null> {
  // A bound array would travel as a Postgres array, so the links go as JSON text.
  const values = sql`${input.live}, ${input.bilingual}, ${input.taglineEn},
    ${input.taglineAr}, ${JSON.stringify(input.socialLinks)}::text::jsonb, ${input.bannerEn}, ${input.bannerAr},
    ${input.bannerTone}, ${input.bannerUntil}::timestamptz, ${input.theme}::jsonb,
    ${input.chrome}::jsonb`;
  if (input.expectedVersion === 0) {
    const [row] = await tx.execute<{ version: number }>(sql`
      insert into core.site_settings (tenant_id, org_id, live, bilingual,
        tagline_en, tagline_ar, social_links, banner_en, banner_ar, banner_tone, banner_until,
        theme, chrome)
      values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${values})
      on conflict do nothing
      returning version`);
    return row?.version ?? null;
  }
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.site_settings
    set (live, bilingual, tagline_en, tagline_ar, social_links, banner_en,
      banner_ar, banner_tone, banner_until, theme, chrome) = (${values})
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

export interface PageRow {
  id: string;
  version: number;
  orgId: string;
  parentId: string | null;
  position: number;
  slug: string;
  isHome: boolean;
  inMenu: boolean;
  indexed: boolean;
  titleEn: string;
  titleAr: string;
  state: SiteState;
  publishedAt: string | null;
  revisedAt: string | null;
}

type PageRecord = {
  id: string;
  version: number;
  org_id: string;
  parent_id: string | null;
  position: number;
  slug: string;
  is_home: boolean;
  in_menu: boolean;
  indexed: boolean;
  title_en: string;
  title_ar: string;
  state: SiteState;
  published_at: string | null;
  revised_at: string | null;
};

const pageColumns = sql`id, version, org_id, parent_id, position, slug, is_home, in_menu, indexed,
  title_en, title_ar, state, ${isoOf(sql`published_at`)} as published_at,
  ${isoOf(sql`revised_at`)} as revised_at`;

function pageOf(row: PageRecord): PageRow {
  return {
    id: row.id,
    version: row.version,
    orgId: row.org_id,
    parentId: row.parent_id,
    position: row.position,
    slug: row.slug,
    isHome: row.is_home,
    inMenu: row.in_menu,
    indexed: row.indexed,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    state: row.state,
    publishedAt: row.published_at,
    revisedAt: row.revised_at,
  };
}

/** Every page of the school's site that is not archived, in menu order. */
export async function sitePages(
  tx: Tx,
  tenantId: string,
  orgId: string,
): Promise<PageRow[]> {
  const rows = await tx.execute<PageRecord>(sql`
    select ${pageColumns} from core.site_pages
    where tenant_id = ${tenantId}::uuid and org_id = ${orgId}::uuid and status = 'active'
    order by is_home desc, position, id`);
  return rows.map(pageOf);
}

export async function pageById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<PageRow | null> {
  const [row] = await tx.execute<PageRecord>(sql`
    select ${pageColumns} from core.site_pages
    where tenant_id = ${tenantId}::uuid and id = ${id}::uuid and status = 'active'`);
  return row ? pageOf(row) : null;
}

export interface PageFields {
  parentId: string | null;
  slug: string;
  titleEn: string;
  titleAr: string;
  inMenu: boolean;
  indexed: boolean;
}

export async function insertPage(
  tx: Tx,
  input: PageFields & {
    tenantId: string;
    orgId: string;
    authorId: string;
    isHome?: boolean;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.site_pages (tenant_id, org_id, parent_id, position, slug, is_home,
      in_menu, indexed, title_en, title_ar, author_user_id)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid,
      ${input.parentId}::uuid,
      (select coalesce(max(position) + 1, 0) from core.site_pages
        where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
          and parent_id is not distinct from ${input.parentId}::uuid and status = 'active'),
      ${input.slug}, ${input.isHome ?? false}, ${input.inMenu}, ${input.indexed}, ${input.titleEn}, ${input.titleAr},
      ${input.authorId}::uuid)
    returning id, version`);
  if (!row) throw new Error("page was not inserted");
  return row;
}

/** Saves a page's fields; a published page is marked as changed since publishing. */
export async function updatePage(
  tx: Tx,
  input: PageFields & {
    tenantId: string;
    id: string;
    expectedVersion: number;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.site_pages
    set slug = ${input.slug}, title_en = ${input.titleEn}, title_ar = ${input.titleAr},
        in_menu = ${input.inMenu}, indexed = ${input.indexed},
        revised_at = case when state = 'published' then statement_timestamp() else revised_at end
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/**
 * Shows a page in the menu or leaves it out. The menu is not part of what
 * a page publishes, so a published page is not marked as changed.
 */
export async function setPageInMenu(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    inMenu: boolean;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.site_pages set in_menu = ${input.inMenu}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

export async function setPageState(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    state: SiteState;
    publishedAt: string | null;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.site_pages
    set state = ${input.state}, published_at = ${input.publishedAt}::timestamptz, revised_at = null
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/**
 * Puts a page under a parent at a position among its siblings, closing the
 * gap it leaves; the others keep their order.
 */
export async function placePage(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id: string;
    parentId: string | null;
    position: number;
  },
): Promise<void> {
  const siblings = await tx.execute<{ id: string }>(sql`
    select id from core.site_pages
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and parent_id is not distinct from ${input.parentId}::uuid and status = 'active'
      and id <> ${input.id}::uuid
    order by position, id`);
  const order = siblings.map((row) => row.id);
  order.splice(Math.min(input.position, order.length), 0, input.id);
  await tx.execute(sql`
    update core.site_pages p
    set parent_id = ${input.parentId}::uuid, position = o.ordinality - 1
    from unnest(${uuidArray(order)}) with ordinality as o(id, ordinality)
    where p.tenant_id = ${input.tenantId}::uuid and p.id = o.id`);
}

export async function removePage(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<void> {
  await tx.execute(sql`
    update core.site_pages set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
}

/** Writes what visitors read of a page in one language, replacing the last copy. */
export async function writePublishedPage(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    page: PageRow;
    locale: SiteLocale;
    title: string;
    content: Record<string, unknown>;
    media: Record<string, string>;
    visibleFrom: string;
  },
): Promise<void> {
  const { page } = input;
  const [updated] = await tx.execute<{ id: string }>(sql`
    update core.site_published_pages
    set slug = ${page.slug}, parent_id = ${page.parentId}::uuid, position = ${page.position},
        is_home = ${page.isHome}, in_menu = ${page.inMenu}, indexed = ${page.indexed}, title = ${input.title},
        content = ${input.content}::jsonb, media = ${input.media}::jsonb,
        visible_from = ${input.visibleFrom}::timestamptz, revised_at = null
    where tenant_id = ${input.tenantId}::uuid and page_id = ${page.id}::uuid
      and locale = ${input.locale} and status = 'active'
    returning id`);
  if (updated) return;
  await tx.execute(sql`
    insert into core.site_published_pages (tenant_id, page_id, org_id, locale, slug,
      parent_id, position, is_home, in_menu, indexed, title, content, media, visible_from)
    values (${input.tenantId}::uuid, ${page.id}::uuid, ${input.orgId}::uuid,
      ${input.locale},
      ${page.slug}, ${page.parentId}::uuid, ${page.position}, ${page.isHome}, ${page.inMenu}, ${page.indexed},
      ${input.title}, ${input.content}::jsonb, ${input.media}::jsonb,
      ${input.visibleFrom}::timestamptz)`);
}

/** The pages whose published copies show a shared section. */
export async function pagesShowingShared(
  tx: Tx,
  input: { tenantId: string; orgId: string; sharedId: string },
): Promise<string[]> {
  const rows = await tx.execute<{ page_id: string }>(sql`
    select distinct page_id from core.site_published_pages
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active'
      and jsonb_path_exists(content, 'lax $.sections[*].section ? (@.shared == $id)',
        jsonb_build_object('id', ${input.sharedId}::text))`);
  return rows.map((row) => row.page_id);
}

/**
 * Rewrites what visitors read of a published page in one language when a
 * shared section it shows changes, leaving when it was published as it was.
 */
export async function revisePublishedPage(
  tx: Tx,
  input: {
    tenantId: string;
    pageId: string;
    locale: SiteLocale;
    content: Record<string, unknown>;
    media: Record<string, string>;
  },
): Promise<void> {
  await tx.execute(sql`
    update core.site_published_pages
    set content = ${input.content}::jsonb, media = ${input.media}::jsonb,
      revised_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and page_id = ${input.pageId}::uuid
      and locale = ${input.locale} and status = 'active'`);
}

/** Keeps the published copies' place in the menu in step with the page tree. */
export async function syncPublishedPlaces(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<void> {
  await tx.execute(sql`
    update core.site_published_pages c
    set parent_id = p.parent_id, position = p.position, in_menu = p.in_menu
    from core.site_pages p
    where c.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.orgId}::uuid
      and p.tenant_id = c.tenant_id and p.id = c.page_id and c.status = 'active'
      and (c.parent_id is distinct from p.parent_id or c.position <> p.position
        or c.in_menu <> p.in_menu)`);
}

/** Visitors no longer see the page, in any language. */
export async function withdrawPage(
  tx: Tx,
  input: { tenantId: string; pageId: string },
): Promise<void> {
  await tx.execute(sql`
    update core.site_published_pages set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and page_id = ${input.pageId}::uuid
      and status = 'active'`);
}

export interface CategoryRow {
  id: string;
  version: number;
  slug: string;
  nameEn: string;
  nameAr: string;
  position: number;
  posts: number;
}

export async function siteCategories(
  tx: Tx,
  tenantId: string,
  orgId: string,
): Promise<CategoryRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    slug: string;
    name_en: string;
    name_ar: string;
    position: number;
    posts: number;
  }>(sql`
    select c.id, c.version, c.slug, c.name_en, c.name_ar, c.position,
      (select count(*)::int from core.site_posts p
        where p.tenant_id = c.tenant_id and p.category_id = c.id
          and p.status = 'active') as posts
    from core.site_categories c
    where c.tenant_id = ${tenantId}::uuid and c.org_id = ${orgId}::uuid and c.status = 'active'
    order by c.position, c.id`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    slug: row.slug,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    position: row.position,
    posts: row.posts,
  }));
}

export async function saveCategory(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id: string;
    expectedVersion: number;
    slug: string;
    nameEn: string;
    nameAr: string;
  },
): Promise<{ id: string; version: number } | null> {
  if (!input.id) {
    const [row] = await tx.execute<{ id: string; version: number }>(sql`
      insert into core.site_categories (tenant_id, org_id, slug, name_en, name_ar, position)
      values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.slug}, ${input.nameEn},
        ${input.nameAr}, (select coalesce(max(position) + 1, 0) from core.site_categories
          where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
            and status = 'active'))
      returning id, version`);
    return row ?? null;
  }
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    update core.site_categories
    set slug = ${input.slug}, name_en = ${input.nameEn}, name_ar = ${input.nameAr}
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning id, version`);
  return row ?? null;
}

/** A category goes; its posts stay, uncategorised. */
export async function removeCategory(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<boolean> {
  await tx.execute(sql`
    update core.site_posts set category_id = null
    where tenant_id = ${input.tenantId}::uuid and category_id = ${input.id}::uuid`);
  await tx.execute(sql`
    update core.site_published_posts set category_id = null
    where tenant_id = ${input.tenantId}::uuid and category_id = ${input.id}::uuid`);
  const [row] = await tx.execute<{ id: string }>(sql`
    update core.site_categories set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and status = 'active'
    returning id`);
  return Boolean(row);
}

/** How an announcement stands on the website: its address, category and place first. */
export interface SitePost {
  slug: string;
  categoryId: string | null;
  pinned: boolean;
}

/** How each of these announcements stands on the website, for those that do. */
export async function sitePostsOf(
  tx: Tx,
  input: { tenantId: string; broadcastIds: readonly string[] },
): Promise<Map<string, SitePost>> {
  if (input.broadcastIds.length === 0) return new Map();
  const rows = await tx.execute<{
    broadcast_id: string;
    slug: string;
    category_id: string | null;
    pinned: boolean;
  }>(sql`
    select broadcast_id, slug, category_id, pinned from core.site_posts
    where tenant_id = ${input.tenantId}::uuid
      and broadcast_id = any(${uuidArray(input.broadcastIds)}) and status = 'active'`);
  return new Map(
    rows.map((row) => [
      row.broadcast_id,
      { slug: row.slug, categoryId: row.category_id, pinned: row.pinned },
    ]),
  );
}

/**
 * Puts an announcement on the website as these settings say, or takes it
 * off with null. Its words reach visitors only once it is published.
 */
export async function keepSitePost(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    broadcastId: string;
    post: SitePost | null;
  },
): Promise<void> {
  const { post } = input;
  if (!post) {
    await tx.execute(sql`
      update core.site_posts set status = 'tobedeleted'
      where tenant_id = ${input.tenantId}::uuid and broadcast_id = ${input.broadcastId}::uuid
        and status = 'active'`);
    return;
  }
  const [changed] = await tx.execute<{ id: string }>(sql`
    update core.site_posts
    set slug = ${post.slug}, category_id = ${post.categoryId}::uuid, pinned = ${post.pinned}
    where tenant_id = ${input.tenantId}::uuid and broadcast_id = ${input.broadcastId}::uuid
      and status = 'active'
    returning id`);
  if (changed) return;
  await tx.execute(sql`
    insert into core.site_posts (tenant_id, org_id, broadcast_id, slug, category_id, pinned)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.broadcastId}::uuid,
      ${post.slug}, ${post.categoryId}::uuid, ${post.pinned})`);
}

/** The announcements a school has on its website, as a subquery of their ids. */
export const postedAnnouncements = (input: {
  tenantId: string;
  schoolId: string;
}) => sql`(select p.broadcast_id from core.site_posts p
  where p.tenant_id = ${input.tenantId}::uuid and p.org_id = ${input.schoolId}::uuid
    and p.status = 'active')`;

/** The announcements pinned first among a school's website posts, as a subquery of their ids. */
export const pinnedAnnouncements = (input: {
  tenantId: string;
  schoolId: string;
}) => sql`(select p.broadcast_id from core.site_posts p
  where p.tenant_id = ${input.tenantId}::uuid and p.org_id = ${input.schoolId}::uuid
    and p.status = 'active' and p.pinned)`;

export async function writePublishedPost(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    post: SitePost & { id: string };
    locale: SiteLocale;
    title: string;
    excerpt: string;
    coverKey: string | null;
    coverAlt: string;
    content: Record<string, unknown>;
    media: Record<string, string>;
    visibleFrom: string;
  },
): Promise<void> {
  const { post } = input;
  const [updated] = await tx.execute<{ id: string }>(sql`
    update core.site_published_posts
    set slug = ${post.slug}, category_id = ${post.categoryId}::uuid, title = ${input.title},
        excerpt = ${input.excerpt}, cover_key = ${input.coverKey}, cover_alt = ${input.coverAlt},
        pinned = ${post.pinned}, content = ${input.content}::jsonb, media = ${input.media}::jsonb,
        visible_from = ${input.visibleFrom}::timestamptz
    where tenant_id = ${input.tenantId}::uuid and post_id = ${post.id}::uuid
      and locale = ${input.locale} and status = 'active'
    returning id`);
  if (updated) return;
  await tx.execute(sql`
    insert into core.site_published_posts (tenant_id, post_id, org_id, locale, slug, category_id,
      title, excerpt, cover_key, cover_alt, pinned, content, media, visible_from)
    values (${input.tenantId}::uuid, ${post.id}::uuid, ${input.orgId}::uuid, ${input.locale},
      ${post.slug}, ${post.categoryId}::uuid, ${input.title}, ${input.excerpt}, ${input.coverKey},
      ${input.coverAlt}, ${post.pinned}, ${input.content}::jsonb, ${input.media}::jsonb,
      ${input.visibleFrom}::timestamptz)`);
}

export async function withdrawPost(
  tx: Tx,
  input: { tenantId: string; postId: string },
): Promise<void> {
  await tx.execute(sql`
    update core.site_published_posts set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and post_id = ${input.postId}::uuid
      and status = 'active'`);
}

export interface Publication {
  fileId: string;
  publicKey: string;
  /** A size made of the file, published beside it; none for the file itself. */
  derivative: string | null;
}

/** The files a page or post shows publicly now, by the key each is served under. */
export async function publicationsOf(
  tx: Tx,
  input: { tenantId: string; hostType: string; hostId: string },
): Promise<Publication[]> {
  const rows = await tx.execute<{
    file_id: string;
    public_key: string;
    derivative: string | null;
  }>(sql`
    select file_id, public_key, derivative from core.file_publications
    where tenant_id = ${input.tenantId}::uuid and host_type = ${input.hostType}
      and host_id = ${input.hostId}::uuid and status = 'active' and unpublished_at is null`);
  return rows.map((row) => ({
    fileId: row.file_id,
    publicKey: row.public_key,
    derivative: row.derivative,
  }));
}

export async function recordPublication(
  tx: Tx,
  input: {
    tenantId: string;
    fileId: string;
    purpose: string;
    publicKey: string;
    hostType: string;
    hostId: string;
    derivative?: string | null;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into core.file_publications (tenant_id, file_id, file_purpose, public_key, host_type,
      host_id, derivative)
    values (${input.tenantId}::uuid, ${input.fileId}::uuid, ${input.purpose}, ${input.publicKey},
      ${input.hostType}, ${input.hostId}::uuid, ${input.derivative ?? null})`);
}

/** A public copy of a file, where it is published and the sizes already beside it. */
export interface PublishedHolder {
  fileId: string;
  purpose: string;
  publicKey: string;
  hostType: string;
  hostId: string;
  derivatives: string[];
}

/** Every page or post showing a file with these bytes publicly now. */
export async function publishedHolders(
  tx: Tx,
  input: { tenantId: string; storageKey: string },
): Promise<PublishedHolder[]> {
  const rows = await tx.execute<{
    file_id: string;
    file_purpose: string;
    public_key: string;
    host_type: string;
    host_id: string;
    derivatives: string[];
  }>(sql`
    select p.file_id, p.file_purpose, p.public_key, p.host_type, p.host_id,
      coalesce((select array_agg(d.derivative) from core.file_publications d
        where d.tenant_id = p.tenant_id and d.file_id = p.file_id
          and d.host_type = p.host_type and d.host_id = p.host_id
          and d.derivative is not null and d.status = 'active' and d.unpublished_at is null),
        '{}')::text[] as derivatives
    from core.file_publications p
    join core.files f on f.tenant_id = p.tenant_id and f.id = p.file_id and f.status = 'active'
    where p.tenant_id = ${input.tenantId}::uuid and f.storage_key = ${input.storageKey}
      and p.derivative is null and p.status = 'active' and p.unpublished_at is null`);
  return rows.map((row) => ({
    fileId: row.file_id,
    purpose: row.file_purpose,
    publicKey: row.public_key,
    hostType: row.host_type,
    hostId: row.host_id,
    derivatives: row.derivatives,
  }));
}

/**
 * Adds what a picture published since adds to the copies visitors read of
 * a page or post that shows it, in every language, so their browsers pick
 * from its sizes at once.
 */
export async function keepPublishedPicture(
  tx: Tx,
  input: {
    tenantId: string;
    host: "page" | "post";
    hostId: string;
    fileId: string;
    picture: PublishedPicture;
  },
): Promise<number> {
  const table =
    input.host === "page"
      ? sql`core.site_published_pages`
      : sql`core.site_published_posts`;
  const id = input.host === "page" ? sql`page_id` : sql`post_id`;
  const rows = await tx.execute(sql`
    update ${table}
    set content = content || jsonb_build_object('pictures',
      coalesce(content->'pictures', '{}'::jsonb)
        || jsonb_build_object(${input.fileId}::text, ${JSON.stringify(input.picture)}::text::jsonb))
    where tenant_id = ${input.tenantId}::uuid and ${id} = ${input.hostId}::uuid
      and status = 'active' and media ? ${input.fileId}::text
    returning 1`);
  return rows.length;
}

/** Ends the publications of these files for a host; the keys come back so their objects go. */
export async function endPublications(
  tx: Tx,
  input: {
    tenantId: string;
    hostType: string;
    hostId: string;
    keepFileIds: readonly string[];
  },
): Promise<string[]> {
  const rows = await tx.execute<{ public_key: string }>(sql`
    update core.file_publications set unpublished_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and host_type = ${input.hostType}
      and host_id = ${input.hostId}::uuid and status = 'active' and unpublished_at is null
      and not (file_id = any(${uuidArray(input.keepFileIds)}))
    returning public_key`);
  return rows.map((row) => row.public_key);
}

export interface PublishableFile {
  id: string;
  purpose: string;
  name: string;
  storageKey: string;
  mediaType: string;
}

/** The ready files of this school that may be published, by id. */
export async function publishableFiles(
  tx: Tx,
  input: { tenantId: string; fileIds: readonly string[] },
): Promise<PublishableFile[]> {
  if (input.fileIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    purpose: string;
    name: string;
    storage_key: string;
    media_type: string;
  }>(sql`
    select id, purpose, name, storage_key, media_type from core.files
    where tenant_id = ${input.tenantId}::uuid and id = any(${uuidArray(input.fileIds)})
      and status = 'active' and state = 'ready'
      and purpose = any(${textArray(["site_media", "logo", "document_media"])})`);
  return rows.map((row) => ({
    id: row.id,
    purpose: row.purpose,
    name: row.name,
    storageKey: row.storage_key,
    mediaType: row.media_type,
  }));
}

/**
 * The people shown in these files whose families have not agreed to their
 * picture being shown in this way: the website, or school news. Anything
 * but a current yes counts, so a photo waits until a family has answered.
 */
export async function subjectsWithoutConsent(
  tx: Tx,
  input: {
    tenantId: string;
    fileIds: readonly string[];
    meaning: "photo_website" | "photo_internal";
    /** Today at the school, which an answer must cover. */
    on: string;
  },
): Promise<string[]> {
  if (input.fileIds.length === 0) return [];
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct s.user_id from core.file_subjects s
    where s.tenant_id = ${input.tenantId}::uuid and s.file_id = any(${uuidArray(input.fileIds)})
      and s.status = 'active'
      and not exists (
        select 1 from core.current_consents c
        join core.descriptors d on d.tenant_id = c.tenant_id and d.id = c.purpose_descriptor_id
        where c.tenant_id = s.tenant_id and c.subject_user_id = s.user_id
          and d.system_meaning = ${input.meaning} and c.decision = 'granted'
          and c.valid_during @> ${input.on}::date)`);
  return rows.map((row) => row.user_id);
}

/**
 * Takes down every public copy of a photo showing this person, wherever it
 * was published; the keys come back so the objects go.
 */
export async function endPublicationsShowing(
  tx: Tx,
  input: { tenantId: string; userId: string },
): Promise<{ publicKey: string; hostType: string; hostId: string }[]> {
  const rows = await tx.execute<{
    public_key: string;
    host_type: string;
    host_id: string;
  }>(sql`
    update core.file_publications p set unpublished_at = statement_timestamp()
    where p.tenant_id = ${input.tenantId}::uuid and p.status = 'active' and p.unpublished_at is null
      and exists (
        select 1 from core.file_subjects s
        where s.tenant_id = p.tenant_id and s.file_id = p.file_id
          and s.user_id = ${input.userId}::uuid and s.status = 'active')
    returning p.public_key, p.host_type, p.host_id`);
  return rows.map((row) => ({
    publicKey: row.public_key,
    hostType: row.host_type,
    hostId: row.host_id,
  }));
}

export interface PublicPage {
  pageId: string;
  slug: string;
  isHome: boolean;
  indexed: boolean;
  title: string;
  content: Record<string, unknown>;
  media: Record<string, string>;
  /** The languages the page is published in its own words. */
  locales: SiteLocale[];
}

export interface MenuEntry {
  pageId: string;
  parentId: string | null;
  slug: string;
  isHome: boolean;
  title: string;
}

/** The site's menu in one language: published pages shown in it, in tree order. */
export async function publicMenu(
  tx: Tx,
  input: { orgId: string; locale: SiteLocale },
): Promise<MenuEntry[]> {
  const rows = await tx.execute<{
    page_id: string;
    parent_id: string | null;
    slug: string;
    is_home: boolean;
    title: string;
  }>(sql`
    select page_id, parent_id, slug, is_home, title from core.site_published_pages
    where org_id = ${input.orgId}::uuid and locale = ${input.locale} and in_menu
    order by is_home desc, position, page_id`);
  return rows.map((row) => ({
    pageId: row.page_id,
    parentId: row.parent_id,
    slug: row.slug,
    isHome: row.is_home,
    title: row.title,
  }));
}

/**
 * Whether a published copy is in its own language: the other language of a
 * page whose translation was never written shows only the first's words.
 */
const speaks = (alias: string) => {
  const copy = sql.identifier(alias);
  return sql`exists (select 1 from jsonb_array_elements(${copy}.content->'sections') e
    where e->>'locale' = ${copy}.locale)`;
};

export async function publicPage(
  tx: Tx,
  input: { orgId: string; locale: SiteLocale; slug: string },
): Promise<PublicPage | null> {
  const which = input.slug ? sql`p.slug = ${input.slug}` : sql`p.is_home`;
  const [row] = await tx.execute<{
    page_id: string;
    slug: string;
    is_home: boolean;
    indexed: boolean;
    title: string;
    content: Record<string, unknown>;
    media: Record<string, string>;
    locales: SiteLocale[];
  }>(sql`
    select p.page_id, p.slug, p.is_home, p.indexed, p.title, p.content, p.media,
      array(select o.locale from core.site_published_pages o
        where o.org_id = p.org_id and o.page_id = p.page_id and ${speaks("o")}
        order by o.locale)::text[] as locales
    from core.site_published_pages p
    where p.org_id = ${input.orgId}::uuid and p.locale = ${input.locale} and ${which}
    limit 1`);
  return row
    ? {
        pageId: row.page_id,
        slug: row.slug,
        isHome: row.is_home,
        indexed: row.indexed,
        title: row.title,
        content: row.content,
        media: row.media,
        locales: row.locales,
      }
    : null;
}

/** Where a published page answers on the site, for a redirect to it. */
export async function publishedPageAddress(
  tx: Tx,
  input: { orgId: string; pageId: string },
): Promise<{ slug: string; isHome: boolean } | null> {
  const [row] = await tx.execute<{ slug: string; is_home: boolean }>(sql`
    select slug, is_home from core.site_published_pages
    where org_id = ${input.orgId}::uuid and page_id = ${input.pageId}::uuid
    limit 1`);
  return row ? { slug: row.slug, isHome: row.is_home } : null;
}

export interface SitemapRow {
  kind: "page" | "post";
  slug: string;
  isHome: boolean;
  locale: SiteLocale;
  lastmod: string;
}

/**
 * Everything the site publishes for search engines: each page that is not
 * kept out of search and each post, in every language it is written in,
 * with when that copy was last published.
 */
export async function sitemapEntries(
  tx: Tx,
  orgId: string,
): Promise<SitemapRow[]> {
  const rows = await tx.execute<{
    kind: "page" | "post";
    slug: string;
    is_home: boolean;
    locale: SiteLocale;
    lastmod: string;
  }>(sql`
    select 'page' as kind, p.slug, p.is_home, p.locale,
      ${isoOf(sql`greatest(p.visible_from, p.revised_at)`)} as lastmod, p.position as place
    from core.site_published_pages p
    where p.org_id = ${orgId}::uuid and p.indexed and ${speaks("p")}
    union all
    select 'post', s.slug, false, s.locale, ${isoOf(sql`s.visible_from`)}, 1000
    from core.site_published_posts s
    where s.org_id = ${orgId}::uuid
      and coalesce(s.content->>'locale', s.locale) = s.locale
    order by kind, is_home desc, place, slug, locale`);
  return rows.map((row) => ({
    kind: row.kind,
    slug: row.slug,
    isHome: row.is_home,
    locale: row.locale,
    lastmod: row.lastmod,
  }));
}

export interface RedirectRow {
  id: string;
  version: number;
  fromPath: string;
  toPageId: string | null;
  toUrl: string | null;
  createdBy: { en: string | null; ar: string | null };
  createdAt: string;
}

/** The school's redirects, by the address they come from. */
export async function siteRedirects(
  tx: Tx,
  tenantId: string,
  orgId: string,
): Promise<RedirectRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    from_path: string;
    to_page_id: string | null;
    to_url: string | null;
    by_en: string | null;
    by_ar: string | null;
    created_at: string;
  }>(sql`
    select r.id, r.version, r.from_path, r.to_page_id, r.to_url,
      u.full_name_en as by_en, u.full_name_ar as by_ar,
      ${isoOf(sql`r.created_at`)} as created_at
    from core.site_redirects r
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.created_by_user_id
    where r.tenant_id = ${tenantId}::uuid and r.org_id = ${orgId}::uuid and r.status = 'active'
    order by r.from_path, r.id`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    fromPath: row.from_path,
    toPageId: row.to_page_id,
    toUrl: row.to_url,
    createdBy: { en: row.by_en, ar: row.by_ar },
    createdAt: row.created_at,
  }));
}

export async function saveRedirect(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id: string;
    expectedVersion: number;
    fromPath: string;
    toPageId: string | null;
    toUrl: string | null;
    userId: string;
  },
): Promise<{ id: string; version: number } | null> {
  if (!input.id) {
    const [row] = await tx.execute<{ id: string; version: number }>(sql`
      insert into core.site_redirects (tenant_id, org_id, from_path, to_page_id, to_url,
        created_by_user_id)
      values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.fromPath},
        ${input.toPageId}::uuid, ${input.toUrl}, ${input.userId}::uuid)
      returning id, version`);
    return row ?? null;
  }
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    update core.site_redirects
    set from_path = ${input.fromPath}, to_page_id = ${input.toPageId}::uuid, to_url = ${input.toUrl}
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning id, version`);
  return row ?? null;
}

export async function removeRedirect(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id: string;
    expectedVersion: number;
  },
): Promise<boolean> {
  const [row] = await tx.execute<{ id: string }>(sql`
    update core.site_redirects set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning id`);
  return Boolean(row);
}

/** Where an old address leads, for a visitor whose address found nothing. */
export async function redirectFrom(
  tx: Tx,
  input: { orgId: string; fromPath: string },
): Promise<{ toPageId: string | null; toUrl: string | null } | null> {
  const [row] = await tx.execute<{
    to_page_id: string | null;
    to_url: string | null;
  }>(sql`
    select to_page_id, to_url from core.site_redirects
    where org_id = ${input.orgId}::uuid and from_path = ${input.fromPath}
    limit 1`);
  return row ? { toPageId: row.to_page_id, toUrl: row.to_url } : null;
}

export interface PublicPost {
  postId: string;
  slug: string;
  categoryId: string | null;
  title: string;
  excerpt: string;
  coverKey: string | null;
  coverAlt: string;
  /** The cover's size, placeholder and the sizes published beside it. */
  coverPicture: PublishedPicture | null;
  pinned: boolean;
  publishedAt: string;
}

const publicPostColumns = sql`post_id, slug, category_id, title, excerpt, cover_key, cover_alt,
  (select content->'pictures'->e.key from jsonb_each_text(media) e
    where e.value = cover_key limit 1) as cover_picture,
  pinned, ${isoOf(sql`visible_from`)} as visible_from`;

type PublicPostRecord = {
  post_id: string;
  slug: string;
  category_id: string | null;
  title: string;
  excerpt: string;
  cover_key: string | null;
  cover_alt: string;
  cover_picture: unknown;
  pinned: boolean;
  visible_from: string;
};

function publicPostOf(row: PublicPostRecord): PublicPost {
  return {
    postId: row.post_id,
    slug: row.slug,
    categoryId: row.category_id,
    title: row.title,
    excerpt: row.excerpt,
    coverKey: row.cover_key,
    coverAlt: row.cover_alt,
    coverPicture: publishedPicture(row.cover_picture),
    pinned: row.pinned,
    publishedAt: row.visible_from,
  };
}

/** Published posts in one language, pinned first then newest, a page at a time. */
export async function publicPosts(
  tx: Tx,
  input: {
    orgId: string;
    locale: SiteLocale;
    categoryId: string | null;
    limit: number;
    offset: number;
  },
): Promise<{ rows: PublicPost[]; total: number }> {
  const category = input.categoryId
    ? sql`and category_id = ${input.categoryId}::uuid`
    : sql``;
  const rows = await tx.execute<PublicPostRecord>(sql`
    select ${publicPostColumns} from core.site_published_posts
    where org_id = ${input.orgId}::uuid and locale = ${input.locale} ${category}
    order by pinned desc, visible_from desc, post_id
    limit ${input.limit} offset ${input.offset}`);
  const [count] = await tx.execute<{ total: number }>(sql`
    select count(*)::int as total from core.site_published_posts
    where org_id = ${input.orgId}::uuid and locale = ${input.locale} ${category}`);
  return { rows: rows.map(publicPostOf), total: count?.total ?? 0 };
}

export async function publicPost(
  tx: Tx,
  input: { orgId: string; locale: SiteLocale; slug: string },
): Promise<
  | (PublicPost & {
      content: Record<string, unknown>;
      media: Record<string, string>;
    })
  | null
> {
  const [row] = await tx.execute<
    PublicPostRecord & {
      content: Record<string, unknown>;
      media: Record<string, string>;
    }
  >(sql`
    select ${publicPostColumns}, content, media from core.site_published_posts
    where org_id = ${input.orgId}::uuid and locale = ${input.locale} and slug = ${input.slug}
    limit 1`);
  return row
    ? { ...publicPostOf(row), content: row.content, media: row.media }
    : null;
}

export interface PublicSchool {
  nameEn: string;
  nameAr: string | null;
  address: PostalAddress | null;
  phone: string | null;
  email: string | null;
  /** The digits the school writes Arabic in, which its website follows. */
  digits: "latn" | "arab";
  /** The school's clock, which every time on its website is shown on. */
  timeZone: string;
  /** The school's language, the one its website is written in first. */
  defaultLocale: SiteLocale;
  logoFileId: string | null;
}

/** What a school's website may say about the school itself. */
export async function publicSchool(
  tx: Tx,
  orgId: string,
): Promise<PublicSchool | null> {
  const [row] = await tx.execute<{
    name_en: string;
    name_ar: string | null;
    address: PostalAddress | null;
    phone: string | null;
    email: string | null;
    digits: "latn" | "arab";
    time_zone: string | null;
    default_locale: SiteLocale;
    logo_file_id: string | null;
  }>(sql`
    select name_en, name_ar, address, phone, email, digits, time_zone,
      default_locale, logo_file_id
    from core.orgs
    where id = ${orgId}::uuid and status = 'active'`);
  return row
    ? {
        nameEn: row.name_en,
        nameAr: row.name_ar,
        address: row.address,
        phone: row.phone,
        email: row.email,
        digits: row.digits,
        timeZone: row.time_zone ?? "UTC",
        defaultLocale: row.default_locale,
        logoFileId: row.logo_file_id,
      }
    : null;
}

/** Today in the school's own time zone, for what counts as still to come. */
export async function schoolToday(tx: Tx, orgId: string): Promise<string> {
  const [row] = await tx.execute<{ today: string }>(sql`
    select to_char((statement_timestamp() at time zone coalesce(time_zone, 'UTC'))::date, 'YYYY-MM-DD') as today
    from core.orgs where id = ${orgId}::uuid`);
  return row?.today ?? new Date().toISOString().slice(0, 10);
}

export async function publicCategories(
  tx: Tx,
  orgId: string,
): Promise<{ id: string; slug: string; nameEn: string; nameAr: string }[]> {
  const rows = await tx.execute<{
    id: string;
    slug: string;
    name_en: string;
    name_ar: string;
  }>(sql`
    select id, slug, name_en, name_ar from core.site_categories
    where org_id = ${orgId}::uuid order by position, id`);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    nameEn: row.name_en,
    nameAr: row.name_ar,
  }));
}

export interface NewEnquiry {
  tenantId: string;
  /** Chosen by the caller, since the site role may not read the row back. */
  id: string;
  orgId: string;
  pageId: string | null;
  sectionId: string | null;
  locale: SiteLocale;
  purpose: EnquiryPurpose;
  name: string;
  email: string;
  phone: string;
  childName: string;
  childYear: string;
  message: string;
  answers: FormAnswer[];
  networkKey: string;
}

/**
 * How many enquiries arrived from the website in the last hour, from one
 * network and for the whole school, read as the site role, which sees no
 * more than that. Those staff logged by hand are no flood.
 */
export async function recentEnquiries(
  tx: Tx,
  input: { orgId: string; networkKey: string },
): Promise<{ fromNetwork: number; forSchool: number }> {
  const [row] = await tx.execute<{
    from_network: number;
    for_school: number;
  }>(sql`
    select count(*) filter (where network_key = ${input.networkKey} and network_key <> '')::int as from_network,
      count(*)::int as for_school
    from core.site_enquiries
    where org_id = ${input.orgId}::uuid and status = 'active' and source = 'website'
      and created_at > statement_timestamp() - interval '1 hour'`);
  return {
    fromNetwork: row?.from_network ?? 0,
    forSchool: row?.for_school ?? 0,
  };
}

/** Records an enquiry. The site role may add it but not read it back. */
export async function insertEnquiry(tx: Tx, input: NewEnquiry): Promise<void> {
  await tx.execute(sql`
    insert into core.site_enquiries (tenant_id, id, org_id, page_id, section_id, locale, purpose,
      name, email, phone, child_name, child_year, message, answers, network_key)
    values (${input.tenantId}::uuid, ${input.id}::uuid, ${input.orgId}::uuid, ${input.pageId}::uuid,
      ${input.sectionId}::uuid, ${input.locale}, ${input.purpose}, ${input.name}, ${input.email},
      ${input.phone}, ${input.childName}, ${input.childYear}, ${input.message},
      ${JSON.stringify(input.answers)}::text::jsonb, ${input.networkKey})`);
}
