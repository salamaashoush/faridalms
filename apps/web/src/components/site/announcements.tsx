import type { ContentLocale } from "@faridalms/domain/translations";

import { documentWritten, otherLocale } from "@faridalms/domain/translations";
import { postIssues } from "@faridalms/domain/website";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { useQuery } from "@tanstack/react-query";

import type {
  AnnouncementCopyFieldProps,
  AnnouncementCopyWords,
} from "~/components/announcements/slots";
import type { ModuleFillings } from "~/utils/extension";

import { announcementCopyParts } from "~/components/announcements/slots";
import { LOCALE_LABEL, LOCALE_NAME } from "~/components/content/languages";
import { CheckboxRow } from "~/components/people/fields";
import { DetailsSection } from "~/components/system/DocumentPage";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { announcementSiteOptionsQuery } from "~/queries/site";
import { getAnnouncementPost } from "~/server/site";
import { fill } from "~/utils/extension";

import { PictureField } from "./PictureField";
import { ISSUE_LABEL } from "./studio/labels";

/** How an announcement stands on the website, as its editor holds it. */
interface Post {
  slug: string;
  categoryId: string;
  pinned: boolean;
}

const postOf = (value: unknown): Post | null =>
  value !== null && typeof value === "object" ? (value as Post) : null;

/** A web address from an English title; other titles get one from the clock. */
function slugOf(title: string) {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || `post-${Date.now().toString(36)}`;
}

const pick = <T,>(locale: ContentLocale, en: T, ar: T) =>
  locale === "ar" ? ar : en;

/** On the website the words read as a page under the title, in each language written. */
function problemsOf(words: AnnouncementCopyWords): string[] {
  const other = otherLocale(words.primaryLocale);
  const written = (locale: ContentLocale) =>
    locale === words.primaryLocale ||
    (words.translation !== null && documentWritten(words.translation));
  return [words.primaryLocale, other].filter(written).flatMap((locale) =>
    postIssues({
      coverFileId: words.cover.fileId || null,
      coverAlt: pick(locale, words.cover.altEn, words.cover.altAr),
      body:
        locale === words.primaryLocale
          ? words.body
          : (words.translation ?? words.body),
    }).map((code) =>
      m.siteIssueIn({
        issue: ISSUE_LABEL[code](),
        language: LOCALE_NAME[locale](),
      }),
    ),
  );
}

const field = (name: string) => `announcement-${name}`;

/** Whether the announcement is on the website as well as with its audience. */
function OnWebsite({ value, onChange }: AnnouncementCopyFieldProps) {
  const post = postOf(value);
  return (
    <CheckboxRow
      label={m.annOnWebsiteCheck()}
      hint={m.annOnWebsiteHint()}
      checked={post !== null}
      onChange={(checked) =>
        onChange(checked ? { slug: "", categoryId: "", pinned: false } : null)
      }
    />
  );
}

/** Its picture, category and address on the website, and what stops it going there. */
function WebsitePost({
  value,
  onChange,
  onTouched,
  shown,
  cover,
  onCover,
  onPeople,
  problems,
}: AnnouncementCopyFieldProps) {
  const options = useQuery(announcementSiteOptionsQuery).data;
  const post = postOf(value);
  if (!post) return null;
  const altKey = shown === "ar" ? "coverAltAr" : "coverAltEn";
  return (
    <>
      <DetailsSection title={m.annPicture()}>
        <PictureField
          fileId={cover.fileId || null}
          label={m.annPicture()}
          onChange={(fileId) => onCover({ coverFileId: fileId ?? "" })}
          fromMedia
          onPeople={onPeople}
        />
        {cover.fileId ? (
          <TextField
            id={field("picture-alt")}
            label={`${m.annPictureAlt()} (${LOCALE_LABEL[shown]()})`}
            lang={shown}
            dir={shown === "ar" ? "rtl" : "ltr"}
            maxLength={300}
            value={shown === "ar" ? cover.altAr : cover.altEn}
            onChange={(event) => onCover({ [altKey]: event.target.value })}
          />
        ) : null}
      </DetailsSection>
      <DetailsSection title={m.annOnWebsite()}>
        <SelectField
          id={field("category")}
          label={m.siteCategory()}
          value={post.categoryId}
          options={[
            { value: "", label: m.siteNoCategory() },
            ...(options?.categories ?? []).map((category) => ({
              value: category.id,
              label: inLocale(category.nameEn || null, category.nameAr || null),
            })),
          ]}
          onChange={(categoryId) => onChange({ ...post, categoryId })}
        />
        <TextField
          id={field("slug")}
          label={m.siteSlug()}
          hint={m.sitePostSlugHint({ slug: post.slug || "…" })}
          dir="ltr"
          maxLength={80}
          autoComplete="off"
          value={post.slug}
          onChange={(event) => {
            onTouched();
            onChange({ ...post, slug: event.target.value.toLowerCase() });
          }}
        />
        <CheckboxRow
          label={m.sitePinPost()}
          hint={m.sitePinPostHint()}
          checked={post.pinned}
          onChange={(pinned) => onChange({ ...post, pinned })}
        />
        {problems.length ? (
          <ul className="grid gap-1 text-[13px] leading-[18px] text-destructive">
            {problems.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </DetailsSection>
    </>
  );
}

/** Announcements on the school's website. */
export const WEBSITE: ModuleFillings = {
  module: "website",
  fillings: [
    fill(announcementCopyParts, {
      key: "website",
      initial: (announcementId) => ({
        queryKey: ["site", "announcement-post", announcementId],
        queryFn: () => getAnnouncementPost({ data: { id: announcementId } }),
      }),
      opens: (value) => postOf(value) !== null,
      titled: (value, titleEn) => {
        const post = postOf(value);
        return post && titleEn.trim()
          ? { ...post, slug: slugOf(titleEn) }
          : value;
      },
      sent: (value, titleEn) => {
        const post = postOf(value);
        return post
          ? { ...post, slug: post.slug || slugOf(titleEn.trim()) }
          : null;
      },
      freed: (value, refusal) => {
        const post = postOf(value);
        // Another post may already stand at the address the title gave it.
        return post && refusal === "site.slug_taken"
          ? {
              ...post,
              slug: `${post.slug.slice(0, 60)}-${Date.now().toString(36)}`,
            }
          : null;
      },
      problems: (value, words) => (postOf(value) ? problemsOf(words) : []),
      pictured: "website",
      where: m.annWherePublic,
      on: m.annOnWebsite,
      Toggle: OnWebsite,
      Settings: WebsitePost,
    }),
  ],
};
