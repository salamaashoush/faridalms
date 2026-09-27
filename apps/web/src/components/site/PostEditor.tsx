import type { ContentDocument } from "@faridalms/domain/content";
import type { SiteLocale } from "@faridalms/domain/website";

import { contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { postIssues } from "@faridalms/domain/website";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { sitePostOptionsQuery, sitePostQuery } from "~/queries/site";

import { ContentEditor } from "~/components/content/ContentEditor";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { CheckboxRow } from "~/components/people/fields";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import { StatusBadge } from "~/components/system/status";
import { Textarea } from "~/components/ui/textarea";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { publishSitePost, saveSitePost } from "~/server/site";
import { getMessageFromError } from "~/utils/error";

import type { Languages } from "./studio/draft";

import { LOCALE_NAME } from "./format";
import { History } from "./History";
import { PictureField } from "./PictureField";
import { ISSUE_LABEL } from "./studio/labels";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof sitePostQuery>["queryFn"]>>
>;
type Options = Awaited<
  ReturnType<NonNullable<(typeof sitePostOptionsQuery)["queryFn"]>>
>;

interface Draft {
  categoryId: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  excerptEn: string;
  excerptAr: string;
  coverFileId: string;
  coverAltEn: string;
  coverAltAr: string;
  pinned: boolean;
  body: ContentDocument;
  otherBody: ContentDocument;
  reviewed: boolean;
  when: "now" | "later";
  publishAt: string;
}

const slugOf = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const field = (locale: SiteLocale, en: keyof Draft, ar: keyof Draft) =>
  locale === "ar" ? ar : en;

const dirOf = (locale: SiteLocale) => (locale === "ar" ? "rtl" : "ltr");

/** A news post: its words in each language, its picture, and when it goes out. */
export function PostEditor({
  existing,
  options,
  onClose,
}: {
  existing: Existing | null;
  options: Options;
  onClose: (id?: string) => void;
}) {
  const queryClient = useQueryClient();
  const media = useDocumentMedia();
  const settings = options.settings;
  const languages: Languages = {
    primary: settings.primaryLocale,
    other: settings.bilingual
      ? settings.primaryLocale === "en"
        ? "ar"
        : "en"
      : null,
  };
  const [initial] = useState<Draft>(() => ({
    categoryId: existing?.categoryId ?? options.categories[0]?.id ?? "",
    slug: existing?.slug ?? "",
    titleEn: existing?.titleEn ?? "",
    titleAr: existing?.titleAr ?? "",
    excerptEn: existing?.excerptEn ?? "",
    excerptAr: existing?.excerptAr ?? "",
    coverFileId: existing?.coverFileId ?? "",
    coverAltEn: existing?.coverAltEn ?? "",
    coverAltAr: existing?.coverAltAr ?? "",
    pinned: existing?.pinned ?? false,
    body: existing?.content.body ?? emptyContent(),
    otherBody: existing?.translation?.body ?? emptyContent(),
    reviewed: existing?.translation?.reviewed ?? false,
    when: "now",
    publishAt: "",
  }));
  const [draft, setDraft] = useState(initial);
  const [shown, setShown] = useState(false);
  const leaving = useRef(false);
  const slugTouched = useRef(Boolean(existing));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const primaryTitle =
    languages.primary === "ar" ? draft.titleAr : draft.titleEn;
  const translated =
    languages.other !== null && contentPlainText(draft.otherBody).trim() !== "";
  const problems = (
    languages.other ? [languages.primary, languages.other] : [languages.primary]
  ).flatMap((locale) => {
    if (locale !== languages.primary && !translated) return [];
    return postIssues({
      coverFileId: draft.coverFileId || null,
      coverAlt: locale === "ar" ? draft.coverAltAr : draft.coverAltEn,
      body: locale === languages.primary ? draft.body : draft.otherBody,
    }).map((code) => ({ locale, code }));
  });
  const validity = {
    title: primaryTitle.trim() ? null : m.siteTitleNeeded(),
    slug: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(draft.slug)
      ? null
      : m.siteSlugNeeded(),
    publishAt:
      draft.when === "later" && !draft.publishAt ? m.siteWhenNeeded() : null,
  };
  const save = useMutation({
    mutationFn: () =>
      saveSitePost({
        data: {
          id: existing?.id ?? "",
          expectedVersion: existing?.version ?? 0,
          categoryId: draft.categoryId,
          slug: draft.slug,
          titleEn: draft.titleEn.trim(),
          titleAr: draft.titleAr.trim(),
          excerptEn: draft.excerptEn.trim(),
          excerptAr: draft.excerptAr.trim(),
          coverFileId: draft.coverFileId,
          coverAltEn: draft.coverAltEn.trim(),
          coverAltAr: draft.coverAltAr.trim(),
          pinned: draft.pinned,
          content: { body: draft.body, reviewed: false },
          translation: translated
            ? { body: draft.otherBody, reviewed: draft.reviewed }
            : null,
        },
      }),
  });
  const publish = useMutation({
    mutationFn: (saved: { id: string; version: number }) =>
      publishSitePost({
        data: {
          id: saved.id,
          expectedVersion: saved.version,
          publishAt:
            draft.when === "later" && draft.publishAt
              ? new Date(draft.publishAt).toISOString()
              : "",
          announce: false,
        },
      }),
  });
  const published = existing?.state === "published";
  const failure = save.error ?? publish.error;
  const locales = languages.other
    ? [languages.primary, languages.other]
    : [languages.primary];
  return (
    <RecordForm
      title={existing ? m.siteEditPost() : m.siteNewPost()}
      submitLabel={published ? m.siteSaveQuietly() : m.siteSaveDraft()}
      secondary={{
        label: published
          ? m.sitePublishChanges()
          : draft.when === "later"
            ? m.siteSchedule()
            : m.sitePublish(),
        intent: "publish",
      }}
      onSubmit={async (intent) => {
        setShown(true);
        if (Object.values(validity).some(Boolean)) return;
        if (intent === "publish" && problems.length > 0) {
          toast.error(m.siteFixIssues());
          return;
        }
        let saved: { id: string; version: number };
        try {
          saved = await save.mutateAsync();
        } catch {
          return;
        }
        if (intent === "publish") {
          try {
            await publish.mutateAsync(saved);
          } catch {
            return;
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["site"] });
        leaving.current = true;
        toast.success(
          intent === "publish"
            ? draft.when === "later"
              ? m.siteScheduled()
              : m.sitePublished()
            : m.siteSaved(),
        );
        onClose(saved.id);
      }}
      onCancel={() => onClose()}
      isDirty={() =>
        !leaving.current && JSON.stringify(draft) !== JSON.stringify(initial)
      }
      pending={save.isPending || publish.isPending}
      error={failure ? getMessageFromError(failure) : null}
    >
      <FormSection title={m.sitePostDetails()}>
        {locales.map((locale) => (
          <TextField
            key={`title-${locale}`}
            id={`post-title-${locale}`}
            label={locale === "ar" ? m.siteTitleAr() : m.siteTitleEn()}
            width="name"
            dir={dirOf(locale)}
            lang={locale}
            maxLength={200}
            optional={locale !== languages.primary}
            value={draft[field(locale, "titleEn", "titleAr")] as string}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((current) => ({
                ...current,
                [field(locale, "titleEn", "titleAr")]: value,
                slug:
                  slugTouched.current || locale !== "en"
                    ? current.slug
                    : slugOf(value),
              }));
            }}
            errors={
              shown && locale === languages.primary && validity.title
                ? [validity.title]
                : undefined
            }
          />
        ))}
        <TextField
          id="post-slug"
          label={m.siteSlug()}
          hint={m.sitePostSlugHint({ slug: draft.slug || "…" })}
          width="name"
          dir="ltr"
          maxLength={80}
          autoComplete="off"
          value={draft.slug}
          onChange={(event) => {
            slugTouched.current = true;
            set("slug", event.target.value.toLowerCase());
          }}
          errors={shown && validity.slug ? [validity.slug] : undefined}
        />
        <SelectField
          id="post-category"
          label={m.siteCategory()}
          width="name"
          value={draft.categoryId}
          options={[
            { value: "", label: m.siteNoCategory() },
            ...options.categories.map((category) => ({
              value: category.id,
              label: inLocale(category.nameEn || null, category.nameAr || null),
            })),
          ]}
          onChange={(categoryId) => set("categoryId", categoryId)}
        />
        {locales.map((locale) => (
          <FormField
            key={`excerpt-${locale}`}
            id={`post-excerpt-${locale}`}
            label={m.siteExcerptIn({ language: LOCALE_NAME[locale]() })}
            hint={
              locale === languages.primary ? m.siteExcerptHint() : undefined
            }
            optional
          >
            {(control) => (
              <Textarea
                {...control}
                dir={dirOf(locale)}
                lang={locale}
                rows={2}
                maxLength={300}
                value={draft[field(locale, "excerptEn", "excerptAr")] as string}
                onChange={(event) =>
                  set(
                    field(locale, "excerptEn", "excerptAr"),
                    event.target.value,
                  )
                }
              />
            )}
          </FormField>
        ))}
        <CheckboxRow
          label={m.sitePinPost()}
          hint={m.sitePinPostHint()}
          checked={draft.pinned}
          onChange={(pinned) => set("pinned", pinned)}
        />
      </FormSection>
      <FormSection title={m.siteCover()} description={m.siteCoverHint()}>
        <PictureField
          fileId={draft.coverFileId || null}
          label={m.siteCover()}
          onChange={(fileId) => set("coverFileId", fileId ?? "")}
        />
        {draft.coverFileId
          ? locales.map((locale) => (
              <TextField
                key={`alt-${locale}`}
                id={`post-alt-${locale}`}
                label={m.siteAltIn({ language: LOCALE_NAME[locale]() })}
                width="name"
                dir={dirOf(locale)}
                lang={locale}
                maxLength={300}
                value={
                  draft[field(locale, "coverAltEn", "coverAltAr")] as string
                }
                onChange={(event) =>
                  set(
                    field(locale, "coverAltEn", "coverAltAr"),
                    event.target.value,
                  )
                }
              />
            ))
          : null}
      </FormSection>
      <FormSection title={m.siteBody()}>
        {locales.map((locale) => {
          const primary = locale === languages.primary;
          return (
            <FormField
              key={`body-${locale}`}
              id={`post-body-${locale}`}
              label={m.siteBodyIn({ language: LOCALE_NAME[locale]() })}
              optional={!primary}
            >
              {(control) => (
                <div
                  lang={locale}
                  dir={dirOf(locale)}
                  className="grid min-w-0 gap-2"
                >
                  {!primary && !translated ? (
                    <div>
                      <StatusBadge tone="warning">
                        {m.siteMissingTranslation({
                          language: LOCALE_NAME[locale](),
                        })}
                      </StatusBadge>
                    </div>
                  ) : null}
                  <ContentEditor
                    id={control.id}
                    label={m.siteBodyIn({ language: LOCALE_NAME[locale]() })}
                    value={primary ? draft.body : draft.otherBody}
                    onChange={(value) =>
                      set(primary ? "body" : "otherBody", value)
                    }
                    media={media}
                  />
                </div>
              )}
            </FormField>
          );
        })}
        {languages.other && translated ? (
          <CheckboxRow
            label={m.siteReviewed({ language: LOCALE_NAME[languages.other]() })}
            hint={m.siteReviewedHint()}
            checked={draft.reviewed}
            onChange={(reviewed) => set("reviewed", reviewed)}
          />
        ) : null}
        {problems.length ? (
          <ul className="grid gap-1 text-[13px] leading-[18px] text-destructive">
            {problems.map((entry) => (
              <li key={`${entry.locale}-${entry.code}`}>
                {m.siteIssueIn({
                  issue: ISSUE_LABEL[entry.code](),
                  language: LOCALE_NAME[entry.locale](),
                })}
              </li>
            ))}
          </ul>
        ) : null}
      </FormSection>
      <FormSection title={m.sitePublishing()}>
        <SelectField
          id="post-when"
          label={m.siteWhenPublish()}
          width="reference"
          value={draft.when}
          options={[
            { value: "now", label: m.siteNow() },
            { value: "later", label: m.siteLater() },
          ]}
          onChange={(when) => set("when", when)}
        />
        {draft.when === "later" ? (
          <TextField
            id="post-publish-at"
            label={m.sitePublishAt()}
            type="datetime-local"
            width="reference"
            value={draft.publishAt}
            onChange={(event) => set("publishAt", event.target.value)}
            errors={
              shown && validity.publishAt ? [validity.publishAt] : undefined
            }
          />
        ) : null}
      </FormSection>
      {existing && existing.history.length > 0 ? (
        <FormSection title={m.siteHistory()} description={m.siteHistoryHint()}>
          <History
            kind="post"
            id={existing.id}
            rows={existing.history}
            languages={languages}
          />
        </FormSection>
      ) : null}
    </RecordForm>
  );
}
