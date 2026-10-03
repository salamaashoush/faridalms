import type { AudienceInput } from "@faridalms/domain/announcements";
import type { ContentDocument } from "@faridalms/domain/content";
import type { NewsVisibility } from "@faridalms/domain/news";
import type { ContentLocale } from "@faridalms/domain/translations";

import {
  emptyContent,
  headedContent,
} from "@faridalms/domain/content-conversion";
import {
  CONTENT_LOCALES,
  documentWritten,
  otherLocale,
  translationState,
} from "@faridalms/domain/translations";
import { postIssues } from "@faridalms/domain/website";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import { Textarea } from "@faridalms/ui/textarea";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Archive, CalendarClock, Send } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { newsEditorQuery } from "~/queries/news";

import {
  AudienceList,
  audienceIssue,
  audienceSummary,
} from "~/components/announcements/AudienceList";
import { ContentEditor } from "~/components/content/ContentEditor";
import { ContentView } from "~/components/content/ContentView";
import { LOCALE_LABEL, LOCALE_NAME } from "~/components/content/languages";
import { TranslatedView } from "~/components/content/TranslatedView";
import { TranslationNote } from "~/components/content/TranslationNote";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { usePicturePeople } from "~/components/files/PicturedPeople";
import { CheckboxRow } from "~/components/people/fields";
import { PictureField } from "~/components/site/PictureField";
import { ISSUE_LABEL } from "~/components/site/studio/labels";
import {
  DetailsPanel,
  DetailsSection,
  DocumentPage,
  DocumentTitle,
} from "~/components/system/DocumentPage";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { SheetPanel } from "~/components/system/SheetPanel";
import { useAutosave } from "~/hooks/useAutosave";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { newsOptionsQuery } from "~/queries/news";
import {
  archiveNews,
  publishNews,
  reviewNewsTranslation,
  saveNews,
} from "~/server/news";
import { getMessageFromError } from "~/utils/error";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof newsEditorQuery>["queryFn"]>>
>;
type Review = Existing["translationReview"];

interface Draft {
  visibility: NewsVisibility;
  primaryLocale: ContentLocale;
  bilingual: boolean;
  titleEn: string;
  titleAr: string;
  excerptEn: string;
  excerptAr: string;
  slug: string;
  categoryId: string;
  coverFileId: string;
  coverAltEn: string;
  coverAltAr: string;
  pinned: boolean;
  audiences: AudienceInput[];
  body: ContentDocument;
  translation: ContentDocument;
}

const TEMPLATES = ["weekly", "monthly"] as const;
type Template = (typeof TEMPLATES)[number];

const TEMPLATE_LABEL: Record<Template, () => string> = {
  weekly: m.newsTemplateWeekly,
  monthly: m.newsTemplateMonthly,
};

/** Starter headings, in the post's language rather than the writer's. */
const TEMPLATE_HEADINGS: Record<
  Template,
  ((inputs: object, options: { locale: ContentLocale }) => string)[]
> = {
  weekly: [m.newsStarterPrincipal, m.newsStarterWeek, m.newsStarterDates],
  monthly: [
    m.newsStarterPrincipal,
    m.newsStarterHighlights,
    m.newsStarterClasses,
    m.newsStarterDates,
  ],
};

const STATE_LABEL: Record<
  "draft" | "scheduled" | "published" | "archived",
  () => string
> = {
  draft: m.newsStateDraft,
  scheduled: m.newsStateScheduled,
  published: m.annStatePublished,
  archived: m.newsStateArchived,
};

const STATE_TONE = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  archived: "neutral",
} as const;

const FAMILIES: AudienceInput[] = [
  { scope: "families", classId: "", gradeId: "" },
];

/** A web address from an English title; other titles get one from the clock. */
function slugOf(title: string) {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || `news-${Date.now().toString(36)}`;
}

const pick = <T,>(locale: ContentLocale, en: T, ar: T) =>
  locale === "ar" ? ar : en;

function draftOf(existing: Existing | null): Draft {
  return {
    visibility: existing?.visibility ?? "school",
    primaryLocale:
      existing?.primaryLocale ?? (getLocale() === "ar" ? "ar" : "en"),
    bilingual: existing ? existing.translation !== null : false,
    titleEn: existing?.titleEn ?? "",
    titleAr: existing?.titleAr ?? "",
    excerptEn: existing?.excerptEn ?? "",
    excerptAr: existing?.excerptAr ?? "",
    slug: existing?.slug ?? "",
    categoryId: existing?.categoryId ?? "",
    coverFileId: existing?.coverFileId ?? "",
    coverAltEn: existing?.coverAltEn ?? "",
    coverAltAr: existing?.coverAltAr ?? "",
    pinned: existing?.pinned ?? false,
    audiences: existing
      ? existing.audiences.map((row) => ({
          scope: row.scope,
          classId: row.classId ?? "",
          gradeId: row.gradeId ?? "",
        }))
      : FAMILIES,
    body: existing?.body ?? emptyContent(),
    translation: existing?.translation ?? emptyContent(),
  };
}

/**
 * A post written as a document in its first language, with its other
 * language beside it when it has two. It goes to the school's audience, the
 * website, or both. Drafts, and edits to a post already out, save
 * themselves; readers keep what they received until it is published again.
 */
export function NewsEditor({
  existing,
  onClose,
  onCreated,
}: {
  existing: Existing | null;
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}) {
  const options = useSuspenseQuery(newsOptionsQuery).data;
  const queryClient = useQueryClient();
  const documentMedia = useDocumentMedia();
  const id = useRef(existing?.id ?? "");
  const version = useRef(existing?.version ?? 0);
  const slugTouched = useRef(Boolean(existing));
  // A post saved before it has an English title keeps one address after.
  const fallbackSlug = useRef(existing?.slug ?? "");
  const [stored, setStored] = useState(existing !== null);
  const [postId, setPostId] = useState(existing?.id ?? "");
  const state = existing?.shown ?? "draft";
  const [draft, setDraft] = useState<Draft>(() => draftOf(existing));
  const [review, setReview] = useState<Review>(
    existing?.translationReview ?? null,
  );
  const [changed, setChanged] = useState(existing?.changedSince ?? false);
  const [writing, setWriting] = useState<ContentLocale>(
    () => existing?.primaryLocale ?? (getLocale() === "ar" ? "ar" : "en"),
  );
  const [sendAt, setSendAt] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [valid, setValid] = useState(true);
  // Publishing waits for files still uploading, or they would be left out.
  const [uploading, setUploading] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [pending, setPending] = useState<
    "publish" | "review" | "archive" | null
  >(null);
  const [previewing, setPreviewing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [previewLocale, setPreviewLocale] = useState<ContentLocale>(
    draft.primaryLocale,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const live = state === "published";
  const other = otherLocale(draft.primaryLocale);
  const isPublic = draft.visibility === "public";
  const pictured = usePicturePeople(isPublic ? "website" : "news");
  const media = useMemo(
    () => ({ ...documentMedia, people: pictured.open }),
    [documentMedia, pictured.open],
  );
  const telling = draft.audiences.length > 0;

  const persist = useCallback(
    async (value: Draft) => {
      if (!valid) throw new Error("content.invalid");
      const englishTitle = value.titleEn.trim();
      if (!value.slug && !fallbackSlug.current)
        fallbackSlug.current = slugOf(englishTitle);
      const saved = await saveNews({
        data: {
          id: id.current,
          expectedVersion: version.current,
          visibility: value.visibility,
          primaryLocale: value.primaryLocale,
          titleEn: englishTitle,
          titleAr: value.titleAr.trim(),
          excerptEn: value.excerptEn.trim(),
          excerptAr: value.excerptAr.trim(),
          slug: value.slug || fallbackSlug.current,
          categoryId: value.categoryId,
          coverFileId: value.coverFileId,
          coverAltEn: value.coverAltEn.trim(),
          coverAltAr: value.coverAltAr.trim(),
          pinned: value.pinned,
          audiences: value.audiences,
          body: value.body,
          translation: value.bilingual ? value.translation : null,
        },
      });
      const created = !id.current;
      id.current = saved.id;
      version.current = saved.version;
      setStored(true);
      setPostId(saved.id);
      setReview(saved.translationReview);
      if (live) setChanged(true);
      await queryClient.invalidateQueries({ queryKey: ["news"] });
      if (created) onCreated(saved.id);
    },
    [valid, live, queryClient, onCreated],
  );

  const primaryTitle = pick(draft.primaryLocale, draft.titleEn, draft.titleAr);
  // The server needs a title, and a reachable audience for school news.
  const autosave = useAutosave({
    value: draft,
    save: persist,
    enabled:
      state !== "archived" &&
      primaryTitle.trim() !== "" &&
      audienceIssue(draft.audiences) === null &&
      (isPublic || telling),
  });

  const change = useCallback((patch: Partial<Draft>) => {
    setIssues([]);
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (
        patch.titleEn !== undefined &&
        !slugTouched.current &&
        patch.titleEn.trim()
      )
        next.slug = slugOf(patch.titleEn);
      return next;
    });
  }, []);
  const changeBody = useCallback(
    (body: ContentDocument) => change({ body }),
    [change],
  );
  const changeTranslation = useCallback(
    (translation: ContentDocument) => change({ translation }),
    [change],
  );

  const translation = draft.bilingual
    ? translationState({
        translation: draft.translation,
        reviewed: review !== null,
        current: review?.current ?? false,
      })
    : null;

  const websiteIssues = isPublic
    ? (draft.bilingual ? [draft.primaryLocale, other] : [draft.primaryLocale])
        .filter(
          (locale) =>
            locale === draft.primaryLocale ||
            documentWritten(draft.translation),
        )
        .flatMap((locale) =>
          postIssues({
            coverFileId: draft.coverFileId || null,
            coverAlt: pick(locale, draft.coverAltEn, draft.coverAltAr),
            body:
              locale === draft.primaryLocale ? draft.body : draft.translation,
          }).map((code) =>
            m.siteIssueIn({
              issue: ISSUE_LABEL[code](),
              language: LOCALE_NAME[locale](),
            }),
          ),
        )
    : [];

  const applyTemplate = (template: Template) => {
    change({
      body: headedContent(
        TEMPLATE_HEADINGS[template].map((heading) => ({
          heading: heading({}, { locale: draft.primaryLocale }),
          body: emptyContent(),
        })),
      ),
    });
    setEditorKey((key) => key + 1);
  };

  const later = !live && sendAt !== "";

  const problems = () => {
    const found: string[] = [];
    if (!primaryTitle.trim()) found.push(m.newsTitleNeeded());
    if (!documentWritten(draft.body)) found.push(m.newsBodyNeeded());
    const audience = audienceIssue(draft.audiences);
    if (audience || (!isPublic && !telling)) {
      found.push(audience ?? m.newsErrAudience());
      setDetailsOpen(true);
    }
    if (websiteIssues.length) {
      found.push(...websiteIssues);
      setDetailsOpen(true);
    }
    return found;
  };

  const publish = async () => {
    const found = problems();
    setIssues(found);
    if (found.length) return;
    setPending("publish");
    try {
      await persist(draft);
      autosave.markSaved(draft);
      await publishNews({
        data: {
          id: id.current,
          expectedVersion: version.current,
          publishAt: later ? new Date(sendAt).toISOString() : "",
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["news"] });
      toast.success(
        live
          ? m.newsChangesPublished()
          : later
            ? m.newsScheduled()
            : m.newsPublished(),
      );
      onClose(id.current);
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setPending(null);
    }
  };

  // The check is taken against the original as stored, so what is on screen
  // is saved first.
  const markReviewed = async (reviewed: boolean) => {
    setPending("review");
    try {
      await persist(draft);
      autosave.markSaved(draft);
      const out = await reviewNewsTranslation({
        data: { id: id.current, expectedVersion: version.current, reviewed },
      });
      version.current = out.version;
      setReview(out.review);
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setPending(null);
    }
  };

  const archive = async () => {
    setPending("archive");
    try {
      await autosave.flush();
      await archiveNews({
        data: { id: id.current, expectedVersion: version.current },
      });
      await queryClient.invalidateQueries({ queryKey: ["news"] });
      toast.success(m.newsArchived());
      onClose();
    } catch (error) {
      toast.error(getMessageFromError(error));
      setPending(null);
    }
  };

  const untouched =
    !stored && !documentWritten(draft.body) && writing === draft.primaryLocale;
  const translating = draft.bilingual && writing === other;
  const shown: ContentLocale = translating ? other : draft.primaryLocale;
  const titleKey = shown === "ar" ? "titleAr" : "titleEn";
  const excerptKey = shown === "ar" ? "excerptAr" : "excerptEn";
  const altKey = shown === "ar" ? "coverAltAr" : "coverAltEn";

  const editorFor = (locale: ContentLocale) => (
    <div lang={locale} className="min-w-0">
      <ContentEditor
        key={`${editorKey}-${locale}`}
        id={locale === draft.primaryLocale ? "news-body" : "news-translation"}
        label={
          locale === draft.primaryLocale
            ? LOCALE_LABEL[locale]()
            : `${m.translationTitle()} (${LOCALE_LABEL[locale]()})`
        }
        variant="document"
        value={locale === draft.primaryLocale ? draft.body : draft.translation}
        onChange={
          locale === draft.primaryLocale ? changeBody : changeTranslation
        }
        onValidityChange={setValid}
        onUploadingChange={setUploading}
        media={media}
      />
    </div>
  );

  return (
    <>
      <DocumentPage
        heading={existing ? m.newsEditTitle() : m.newsNewTitle()}
        print={{
          title: draft[titleKey].trim() || primaryTitle,
          content: translating ? draft.translation : draft.body,
        }}
        onBack={async () => {
          if (await autosave.flush()) onClose(id.current || undefined);
        }}
        status={{ label: STATE_LABEL[state](), tone: STATE_TONE[state] }}
        saveState={autosave.state}
        onRetry={autosave.retry}
        primary={
          state === "archived" || (live && !changed)
            ? undefined
            : {
                label: live
                  ? m.newsPublishChanges()
                  : later
                    ? m.annSchedule()
                    : m.annPublish(),
                icon: later ? CalendarClock : Send,
                pending: pending === "publish",
                disabled: uploading,
                onClick: () => void publish(),
              }
        }
        preview={{ label: m.newsPreview(), onClick: () => setPreviewing(true) }}
        history={
          stored
            ? {
                hostType: "site_post",
                hostId: postId,
                onRestore: (content) => {
                  change({ body: content });
                  setWriting(draft.primaryLocale);
                  setEditorKey((key) => key + 1);
                },
              }
            : undefined
        }
        menu={
          stored && state !== "archived"
            ? [
                {
                  label: m.annArchive(),
                  icon: Archive,
                  destructive: true,
                  onSelect: () => void archive(),
                  confirm: {
                    title: m.annArchiveTitle({
                      title: primaryTitle.trim() || m.newsUntitled(),
                    }),
                    body: m.annArchiveBody(),
                    label: m.annArchive(),
                  },
                },
              ]
            : []
        }
        summary={[
          isPublic ? m.newsWherePublic() : m.newsWhereSchool(),
          telling
            ? audienceSummary(draft.audiences, options)
            : m.newsAudienceNone(),
          draft.bilingual
            ? m.contentBothLanguages()
            : LOCALE_LABEL[draft.primaryLocale](),
        ]}
        details={{ open: detailsOpen, onOpenChange: setDetailsOpen }}
        title={
          <div className="grid gap-3">
            {issues.length ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                <ul className="list-disc ps-5">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {draft.bilingual ? (
              <Tabs
                value={writing}
                onValueChange={(value: ContentLocale) => setWriting(value)}
              >
                <TabsList aria-label={m.contentLanguage()}>
                  <TabsTrigger
                    value={draft.primaryLocale}
                    lang={draft.primaryLocale}
                  >
                    {LOCALE_LABEL[draft.primaryLocale]()}
                  </TabsTrigger>
                  <TabsTrigger value={other} lang={other}>
                    {LOCALE_LABEL[other]()}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
            <div lang={shown} dir={shown === "ar" ? "rtl" : "ltr"}>
              <DocumentTitle
                id="news-title"
                label={m.annColTitle()}
                placeholder={m.newsUntitled()}
                maxLength={200}
                value={draft[titleKey]}
                onChange={(title) => change({ [titleKey]: title })}
                onEnter={() =>
                  document
                    .getElementById(
                      translating ? "news-translation" : "news-body",
                    )
                    ?.focus()
                }
              />
            </div>
          </div>
        }
        aside={
          <DetailsPanel title={m.docDetails()}>
            <DetailsSection title={m.newsWhere()} hint={m.newsWhereHint()}>
              <SelectField
                id="news-where"
                label={m.newsWhere()}
                labelHidden
                value={draft.visibility}
                options={[
                  { value: "school", label: m.newsWhereSchool() },
                  { value: "public", label: m.newsWherePublic() },
                ]}
                onChange={(visibility) =>
                  change({
                    visibility,
                    audiences:
                      visibility === "school" && !telling
                        ? FAMILIES
                        : draft.audiences,
                  })
                }
              />
            </DetailsSection>
            <DetailsSection
              title={m.newsAudience()}
              hint={isPublic ? m.newsAudienceOptional() : m.annAudienceHint()}
            >
              {isPublic ? (
                <CheckboxRow
                  label={m.newsAddAudience()}
                  checked={telling}
                  onChange={(checked) =>
                    change({ audiences: checked ? FAMILIES : [] })
                  }
                />
              ) : null}
              {telling ? (
                <AudienceList
                  value={draft.audiences}
                  onChange={(audiences) => change({ audiences })}
                  choices={options}
                  error={null}
                />
              ) : null}
            </DetailsSection>
            <DetailsSection title={m.contentSectionLanguages()}>
              <SelectField
                id="news-language"
                label={m.contentPrimaryLanguage()}
                hint={m.contentPrimaryLanguageHint()}
                value={draft.primaryLocale}
                options={CONTENT_LOCALES.map((locale) => ({
                  value: locale,
                  label: LOCALE_LABEL[locale](),
                }))}
                onChange={(primaryLocale) => {
                  change({ primaryLocale });
                  setWriting(primaryLocale);
                }}
              />
              <CheckboxRow
                label={m.contentBilingual({ language: LOCALE_NAME[other]() })}
                hint={m.contentBilingualHint({
                  language: LOCALE_NAME[draft.primaryLocale](),
                })}
                checked={draft.bilingual}
                onChange={(bilingual) => {
                  change({ bilingual });
                  if (!bilingual) setWriting(draft.primaryLocale);
                }}
              />
            </DetailsSection>
            {draft.bilingual && translation ? (
              <DetailsSection title={m.translationTitle()}>
                <TranslationNote
                  state={translation}
                  review={review}
                  language={LOCALE_NAME[other]()}
                />
                <CheckboxRow
                  label={m.translationReviewedCheck()}
                  hint={m.translationReviewedHint({
                    language: LOCALE_NAME[draft.primaryLocale](),
                  })}
                  checked={translation === "reviewed"}
                  onChange={(checked) => {
                    if (pending !== "review") void markReviewed(checked);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start max-md:h-10"
                  onClick={() => setComparing(true)}
                >
                  {m.translationShowOriginal({
                    language: LOCALE_NAME[draft.primaryLocale](),
                  })}
                </Button>
              </DetailsSection>
            ) : null}
            <DetailsSection title={m.newsSummary()} hint={m.newsSummaryHint()}>
              <FormField
                id="news-summary"
                label={`${m.newsSummary()} (${LOCALE_LABEL[shown]()})`}
                optional
              >
                {(control) => (
                  <Textarea
                    {...control}
                    lang={shown}
                    dir={shown === "ar" ? "rtl" : "ltr"}
                    rows={3}
                    maxLength={300}
                    value={draft[excerptKey]}
                    onChange={(event) =>
                      change({ [excerptKey]: event.target.value })
                    }
                  />
                )}
              </FormField>
            </DetailsSection>
            <DetailsSection title={m.newsPicture()}>
              <PictureField
                fileId={draft.coverFileId || null}
                label={m.newsPicture()}
                onChange={(fileId) => change({ coverFileId: fileId ?? "" })}
                onPeople={pictured.open}
              />
              {draft.coverFileId ? (
                <TextField
                  id="news-picture-alt"
                  label={`${m.newsPictureAlt()} (${LOCALE_LABEL[shown]()})`}
                  lang={shown}
                  dir={shown === "ar" ? "rtl" : "ltr"}
                  maxLength={300}
                  value={draft[altKey]}
                  onChange={(event) => change({ [altKey]: event.target.value })}
                />
              ) : null}
            </DetailsSection>
            {isPublic ? (
              <DetailsSection title={m.newsWebsite()}>
                <SelectField
                  id="news-category"
                  label={m.siteCategory()}
                  value={draft.categoryId}
                  options={[
                    { value: "", label: m.siteNoCategory() },
                    ...options.categories.map((category) => ({
                      value: category.id,
                      label: inLocale(
                        category.nameEn || null,
                        category.nameAr || null,
                      ),
                    })),
                  ]}
                  onChange={(categoryId) => change({ categoryId })}
                />
                <TextField
                  id="news-slug"
                  label={m.siteSlug()}
                  hint={m.sitePostSlugHint({ slug: draft.slug || "…" })}
                  dir="ltr"
                  maxLength={80}
                  autoComplete="off"
                  value={draft.slug}
                  onChange={(event) => {
                    slugTouched.current = true;
                    change({ slug: event.target.value.toLowerCase() });
                  }}
                />
                <CheckboxRow
                  label={m.sitePinPost()}
                  hint={m.sitePinPostHint()}
                  checked={draft.pinned}
                  onChange={(pinned) => change({ pinned })}
                />
                {websiteIssues.length ? (
                  <ul className="grid gap-1 text-[13px] leading-[18px] text-destructive">
                    {websiteIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : null}
              </DetailsSection>
            ) : null}
            <DetailsSection title={m.annSectionDelivery()}>
              {live ? (
                <p className="text-[13px] leading-[18px] text-muted-foreground">
                  {m.newsPublishedHint()}
                </p>
              ) : (
                <FormField
                  id="news-send-at"
                  label={m.annSendAt()}
                  hint={m.annSendAtHint()}
                  optional
                >
                  {(control) => (
                    <Input
                      {...control}
                      type="datetime-local"
                      className="w-full max-md:h-10"
                      value={sendAt}
                      onChange={(event) => setSendAt(event.target.value)}
                    />
                  )}
                </FormField>
              )}
            </DetailsSection>
          </DetailsPanel>
        }
      >
        <div className="grid gap-4">
          {untouched ? (
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <span>{m.newsStartFrom()}</span>
              {TEMPLATES.map((template) => (
                <Button
                  key={template}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="max-md:h-10"
                  onClick={() => applyTemplate(template)}
                >
                  {TEMPLATE_LABEL[template]()}
                </Button>
              ))}
            </div>
          ) : null}
          {editorFor(shown)}
        </div>
      </DocumentPage>
      {pictured.sheet}
      <SheetPanel
        open={comparing}
        onOpenChange={setComparing}
        title={m.translationOriginalTitle({
          language: LOCALE_NAME[draft.primaryLocale](),
        })}
      >
        <div lang={draft.primaryLocale}>
          <ContentView
            document={draft.body}
            fileUrl={(fileId) => `/files/${fileId}`}
          />
        </div>
      </SheetPanel>
      <SheetPanel
        open={previewing}
        onOpenChange={setPreviewing}
        title={m.newsPreview()}
      >
        <h2
          dir="auto"
          className="text-2xl leading-8 font-semibold tracking-tight"
        >
          {pick(previewLocale, draft.titleEn, draft.titleAr) ||
            primaryTitle ||
            m.newsUntitled()}
        </h2>
        <TranslatedView
          body={draft.body}
          translation={draft.bilingual ? draft.translation : null}
          primary={draft.primaryLocale}
          locale={draft.bilingual ? previewLocale : draft.primaryLocale}
          onLocaleChange={setPreviewLocale}
        />
      </SheetPanel>
    </>
  );
}
