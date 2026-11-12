import type { BroadcastRow } from "@faridalms/database/stores/broadcasts";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { SiteLocale } from "@faridalms/domain/website";

import {
  keepSitePost,
  pinnedAnnouncements,
  postedAnnouncements,
  siteCategories,
  sitePostsOf,
  siteSettings,
  withdrawPost,
  writePublishedPost,
} from "@faridalms/database/stores/site";
import { contentFileIds, firstPicture } from "@faridalms/domain/content";
import { documentWritten, otherLocale } from "@faridalms/domain/translations";
import { postIssues, sitePostSchema } from "@faridalms/domain/website";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";
import type { ModuleContributions } from "../core/extension";

import { announcementCopies } from "../announcements/points";
import { contribute } from "../core/extension";
import { readProcedure, requireCapability } from "../core/procedure";
import { liveRevisers } from "../core/shared";
import { publishMedia, withdrawMedia } from "../core/site";
import { fileHosts } from "../files/authorize";
import { WEBSITE_HOSTS, WEBSITE_REVISERS } from "./hosts";

const primaryOf = (row: BroadcastRow): ContentLocale =>
  row.primaryLocale ?? (row.titleAr && !row.titleEn ? "ar" : "en");

const titleIn = (row: BroadcastRow, locale: ContentLocale) => {
  const pick = (which: ContentLocale) =>
    which === "ar" ? row.titleAr : row.titleEn;
  return pick(locale) || pick(primaryOf(row)) || pick(otherLocale(locale));
};

/** The site's languages, which an announcement on the website is published in. */
async function siteLanguages(context: UnitContext) {
  const settings = await siteSettings(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  const primary: SiteLocale = settings?.primaryLocale ?? "en";
  const bilingual = settings?.bilingual ?? true;
  return {
    primaryLocale: primary,
    bilingual,
    locales: bilingual ? [primary, otherLocale(primary)] : [primary],
  };
}

const postMedia = (body: ContentDocument, coverFileId: string | null) => [
  ...new Set([...contentFileIds(body), ...(coverFileId ? [coverFileId] : [])]),
];

async function postOf(context: UnitContext, id: string) {
  return (
    (
      await sitePostsOf(context.tx, {
        tenantId: context.tenantId,
        broadcastIds: [id],
      })
    ).get(id) ?? null
  );
}

/** What stops one on the website going out, per language it is written in. */
function websiteIssues(
  row: Pick<BroadcastRow, "coverFileId" | "coverAltEn" | "coverAltAr">,
  primary: ContentLocale,
  body: ContentDocument,
  translation: ContentDocument | null,
) {
  const found: Record<ContentLocale, string[]> = { en: [], ar: [] };
  for (const locale of [primary, otherLocale(primary)]) {
    const written = locale === primary ? body : translation;
    if (!written || !documentWritten(written)) continue;
    found[locale] = postIssues({
      coverFileId: row.coverFileId,
      coverAlt: locale === "ar" ? row.coverAltAr : row.coverAltEn,
      body: written,
    });
  }
  return found;
}

async function offWebsite(context: UnitContext, row: BroadcastRow) {
  await withdrawPost(context.tx, {
    tenantId: context.tenantId,
    postId: row.id,
  });
  await withdrawMedia(context, {
    tenantId: context.tenantId,
    hostType: "announcement",
    hostId: row.id,
  });
}

/** Writes the website's copy in each of its languages for visitors. */
async function putOnWebsite(
  context: UnitContext,
  input: {
    row: BroadcastRow;
    post: { slug: string; categoryId: string | null; pinned: boolean };
    body: ContentDocument;
    translation: ContentDocument | null;
    publishedAt: string;
  },
) {
  const { row, body, translation } = input;
  const languages = await siteLanguages(context);
  const primary = primaryOf(row);
  const { media, pictures } = await publishMedia(
    context,
    { tenantId: context.tenantId, hostType: "announcement", hostId: row.id },
    [
      ...new Set([
        ...postMedia(body, row.coverFileId),
        ...(translation ? postMedia(translation, null) : []),
      ]),
    ],
  );
  await withdrawPost(context.tx, {
    tenantId: context.tenantId,
    postId: row.id,
  });
  for (const locale of languages.locales) {
    const own = locale === primary ? body : translation;
    const words = (en: string, ar: string) =>
      (locale === "ar" ? ar : en) || (primary === "ar" ? ar : en);
    // One without a cover shows its first picture on its card.
    const picture = row.coverFileId
      ? {
          fileId: row.coverFileId,
          alt: words(row.coverAltEn, row.coverAltAr),
        }
      : firstPicture(own ?? body);
    await writePublishedPost(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      post: { id: row.id, ...input.post },
      locale,
      title: titleIn(row, locale),
      excerpt: words(row.excerptEn, row.excerptAr),
      coverKey: picture ? (media[picture.fileId] ?? null) : null,
      coverAlt: picture?.alt ?? "",
      content: {
        body: own ?? body,
        locale: own ? locale : primary,
        pictures,
      },
      media,
      visibleFrom: input.publishedAt,
    });
  }
}

/** What the website keeps of an announcement: whether it is on the site, and how. */
export const WEBSITE_ANNOUNCEMENTS: ModuleContributions = {
  module: "website",
  contributions: [
    contribute(fileHosts, WEBSITE_HOSTS),
    contribute(liveRevisers, WEBSITE_REVISERS),
    contribute(announcementCopies, {
      key: "website",
      async save(context, input) {
        let post: v.InferOutput<typeof sitePostSchema> | null = null;
        if (input.value !== null) {
          const parsed = v.safeParse(sitePostSchema, input.value);
          if (!parsed.success)
            throw new ORPCError("BAD_REQUEST", {
              message: parsed.issues[0].message,
            });
          post = parsed.output;
        }
        if (
          post?.categoryId &&
          !(
            await siteCategories(context.tx, context.tenantId, context.schoolId)
          ).some((category) => category.id === post.categoryId)
        )
          throw new ORPCError("BAD_REQUEST", {
            message: "validation.invalid",
          });
        await keepSitePost(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          broadcastId: input.row.id,
          post: post && {
            slug: post.slug,
            categoryId: post.categoryId || null,
            pinned: post.pinned,
          },
        });
      },
      opened: postedAnnouncements,
      first: pinnedAnnouncements,
      async opens(context, ids) {
        return new Set(
          (
            await sitePostsOf(context.tx, {
              tenantId: context.tenantId,
              broadcastIds: ids,
            })
          ).keys(),
        );
      },
      async issues(context, input) {
        return (await postOf(context, input.row.id))
          ? websiteIssues(
              input.row,
              primaryOf(input.row),
              input.body,
              input.other,
            )
          : { en: [], ar: [] };
      },
      async published(context, input) {
        const post = await postOf(context, input.row.id);
        await (post
          ? putOnWebsite(context, {
              row: input.row,
              post,
              body: input.body,
              translation: input.other,
              publishedAt: input.publishedAt,
            })
          : offWebsite(context, input.row));
      },
      withdrawn: offWebsite,
      async duplicated(context, input) {
        const post = await postOf(context, input.source.id);
        if (post)
          await keepSitePost(context.tx, {
            tenantId: context.tenantId,
            orgId: context.schoolId,
            broadcastId: input.created.id,
            post: {
              slug: `${post.slug.slice(0, 60)}-${Date.now().toString(36)}`,
              categoryId: post.categoryId,
              pinned: false,
            },
          });
      },
    }),
  ],
};

const byAnnouncement = v.object({ id: v.pipe(v.string(), v.uuid()) });

/** How an announcement stands on the website, for its editor: null where it is not on it. */
export const announcementPost = readProcedure
  .input(byAnnouncement)
  .handler(async ({ input, context }) => {
    requireCapability(context, "announcements:manage");
    const post = await postOf(context, input.id);
    return post
      ? {
          slug: post.slug,
          categoryId: post.categoryId ?? "",
          pinned: post.pinned,
        }
      : null;
  });

/**
 * What an announcement on the website is written for: the site's
 * categories and languages. Whoever writes announcements reads it.
 */
export const announcementOptions = readProcedure.handler(
  async ({ context }) => {
    requireCapability(context, "announcements:manage");
    const [categories, languages] = await Promise.all([
      siteCategories(context.tx, context.tenantId, context.schoolId),
      siteLanguages(context),
    ]);
    return {
      categories: categories.map((category) => ({
        id: category.id,
        nameEn: category.nameEn,
        nameAr: category.nameAr,
      })),
      primaryLocale: languages.primaryLocale,
      bilingual: languages.bilingual,
    };
  },
);
