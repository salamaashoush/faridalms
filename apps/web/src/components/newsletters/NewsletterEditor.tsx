import type { AudienceInput } from "@faridalms/domain/announcements";
import type { ContentDocument } from "@faridalms/domain/content";
import type {
  NewsletterLocale,
  TranslationState,
} from "@faridalms/domain/newsletters";

import {
  emptyContent,
  headedContent,
} from "@faridalms/domain/content-conversion";
import {
  documentWritten,
  NEWSLETTER_LOCALES,
  translationState,
} from "@faridalms/domain/newsletters";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Input } from "@faridalms/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Archive, CalendarClock, Send } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { newsletterEditorQuery } from "~/queries/newsletters";

import {
  AudienceList,
  audienceIssue,
  audienceSummary,
} from "~/components/announcements/AudienceList";
import { ContentEditor } from "~/components/content/ContentEditor";
import { ContentView } from "~/components/content/ContentView";
import { formatInstant } from "~/components/coursework/format";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { CheckboxRow } from "~/components/people/fields";
import {
  DetailsPanel,
  DetailsSection,
  DocumentPage,
  DocumentTitle,
} from "~/components/system/DocumentPage";
import { FormField, SelectField } from "~/components/system/field";
import { SheetPanel } from "~/components/system/SheetPanel";
import { useAutosave } from "~/hooks/useAutosave";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { newsletterOptionsQuery } from "~/queries/newsletters";
import {
  archiveNewsletter,
  publishNewsletter,
  reviewNewsletterTranslation,
  saveNewsletter,
} from "~/server/newsletters";
import { getMessageFromError } from "~/utils/error";

import {
  LOCALE_LABEL,
  LOCALE_NAME,
  NewsletterView,
  otherLocale,
} from "./NewsletterView";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof newsletterEditorQuery>["queryFn"]>>
>;
type Review = Existing["translationReview"];

interface Draft {
  title: string;
  primaryLocale: NewsletterLocale;
  bilingual: boolean;
  audiences: AudienceInput[];
  body: ContentDocument;
  translation: ContentDocument;
}

const TEMPLATES = ["weekly", "monthly"] as const;
type Template = (typeof TEMPLATES)[number];

const TEMPLATE_LABEL: Record<Template, () => string> = {
  weekly: m.nlTemplateWeekly,
  monthly: m.nlTemplateMonthly,
};

/** Starter headings, in the edition's language rather than the writer's. */
const TEMPLATE_HEADINGS: Record<
  Template,
  ((inputs: object, options: { locale: NewsletterLocale }) => string)[]
> = {
  weekly: [m.nlStarterPrincipal, m.nlStarterWeek, m.nlStarterDates],
  monthly: [
    m.nlStarterPrincipal,
    m.nlStarterHighlights,
    m.nlStarterClasses,
    m.nlStarterDates,
  ],
};

const STATE_LABEL: Record<Existing["state"], () => string> = {
  draft: m.nlStateDraft,
  scheduled: m.nlStateScheduled,
  published: m.annStatePublished,
  archived: m.nlStateArchived,
};

const STATE_TONE = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  archived: "neutral",
} as const;

function draftOf(existing: Existing | null): Draft {
  return {
    title: existing?.title ?? "",
    primaryLocale:
      existing?.primaryLocale ?? (getLocale() === "ar" ? "ar" : "en"),
    bilingual: existing?.bilingual ?? false,
    audiences: existing?.audiences.length
      ? existing.audiences.map((row) => ({
          scope: row.scope,
          classId: row.classId ?? "",
          gradeId: row.gradeId ?? "",
        }))
      : [{ scope: "families", classId: "", gradeId: "" }],
    body: existing?.body ?? emptyContent(),
    translation: existing?.translation ?? emptyContent(),
  };
}

function TranslationNote({
  state,
  review,
  language,
}: {
  state: TranslationState;
  review: Review;
  language: string;
}) {
  const user = useCurrentUser();
  const text =
    state === "missing"
      ? m.nlTranslationMissing({ language })
      : state === "unreviewed"
        ? m.nlTranslationUnreviewed()
        : state === "stale"
          ? m.nlTranslationStale()
          : review
            ? m.nlTranslationReviewed({
                name: inLocale(review.byEn, review.byAr),
                date: formatInstant(review.at, user.school.timeZone),
              })
            : "";
  return (
    <p
      className={cn(
        "text-[13px] leading-[18px]",
        state === "reviewed"
          ? "text-muted-foreground"
          : "text-warning-foreground dark:text-warning",
      )}
    >
      {text}
    </p>
  );
}

/**
 * An edition written as a document in its first language, with its other
 * language written beside that original when it has two. Drafts, and edits to
 * an edition already out, save themselves; readers keep what they received
 * until it is published again.
 */
export function NewsletterEditor({
  existing,
  onClose,
  onCreated,
}: {
  existing: Existing | null;
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}) {
  const options = useSuspenseQuery(newsletterOptionsQuery).data;
  const queryClient = useQueryClient();
  const media = useDocumentMedia();
  const id = useRef(existing?.id ?? "");
  const version = useRef(existing?.version ?? 0);
  const [stored, setStored] = useState(existing !== null);
  const state = existing?.state ?? "draft";
  const [draft, setDraft] = useState<Draft>(() => draftOf(existing));
  const [review, setReview] = useState<Review>(
    existing?.translationReview ?? null,
  );
  const [changed, setChanged] = useState(existing?.changedSince ?? false);
  const [writing, setWriting] = useState<NewsletterLocale>(
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
  const [previewLocale, setPreviewLocale] = useState<NewsletterLocale>(
    draft.primaryLocale,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const live = state === "published";
  const other = otherLocale(draft.primaryLocale);

  const persist = useCallback(
    async (value: Draft) => {
      if (!valid) throw new Error("content.invalid");
      const saved = await saveNewsletter({
        data: {
          id: id.current,
          expectedVersion: version.current,
          title: value.title.trim(),
          primaryLocale: value.primaryLocale,
          bilingual: value.bilingual,
          audiences: value.audiences,
          body: value.body,
          translation: value.bilingual ? value.translation : null,
        },
      });
      const created = !id.current;
      id.current = saved.id;
      version.current = saved.version;
      setStored(true);
      setReview(saved.translationReview);
      if (live) setChanged(true);
      await queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      if (created) onCreated(saved.id);
    },
    [valid, live, queryClient, onCreated],
  );

  // The server needs a title and a reachable audience to store an edition.
  const autosave = useAutosave({
    value: draft,
    save: persist,
    enabled:
      state !== "archived" &&
      draft.title.trim() !== "" &&
      audienceIssue(draft.audiences) === null,
  });

  const change = useCallback((patch: Partial<Draft>) => {
    setIssues([]);
    setDraft((current) => ({ ...current, ...patch }));
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
    if (!draft.title.trim()) found.push(m.nlTitleNeeded());
    if (!documentWritten(draft.body)) found.push(m.nlBodyNeeded());
    const audience = audienceIssue(draft.audiences);
    if (audience) {
      found.push(audience);
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
      await publishNewsletter({
        data: {
          id: id.current,
          expectedVersion: version.current,
          publishAt: later ? new Date(sendAt).toISOString() : "",
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      toast.success(
        live
          ? m.nlChangesPublished()
          : later
            ? m.nlScheduled()
            : m.nlPublished(),
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
      const out = await reviewNewsletterTranslation({
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
      await archiveNewsletter({
        data: { id: id.current, expectedVersion: version.current },
      });
      await queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      toast.success(m.nlArchived());
      onClose();
    } catch (error) {
      toast.error(getMessageFromError(error));
      setPending(null);
    }
  };

  const untouched =
    !stored && !documentWritten(draft.body) && writing === draft.primaryLocale;
  const translating = draft.bilingual && writing === other;

  const editorFor = (locale: NewsletterLocale) => (
    <div lang={locale} className="min-w-0">
      <ContentEditor
        key={`${editorKey}-${locale}`}
        id={
          locale === draft.primaryLocale
            ? "newsletter-body"
            : "newsletter-translation"
        }
        label={
          locale === draft.primaryLocale
            ? LOCALE_LABEL[locale]()
            : `${m.nlTranslation()} (${LOCALE_LABEL[locale]()})`
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
        heading={existing ? m.nlEditTitle() : m.nlNewTitle()}
        print={{ title: draft.title, content: draft.body }}
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
                  ? m.nlPublishChanges()
                  : later
                    ? m.annSchedule()
                    : m.annPublish(),
                icon: later ? CalendarClock : Send,
                pending: pending === "publish",
                disabled: uploading,
                onClick: () => void publish(),
              }
        }
        preview={{ label: m.nlPreview(), onClick: () => setPreviewing(true) }}
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
                      title: draft.title.trim() || m.nlUntitled(),
                    }),
                    body: m.annArchiveBody(),
                    label: m.annArchive(),
                  },
                },
              ]
            : []
        }
        summary={[
          audienceSummary(draft.audiences, options),
          draft.bilingual
            ? m.nlBothLanguages()
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
            <DocumentTitle
              id="newsletter-title"
              label={m.annColTitle()}
              placeholder={m.nlUntitled()}
              maxLength={200}
              value={draft.title}
              onChange={(title) => change({ title })}
              onEnter={() =>
                document
                  .getElementById(
                    translating ? "newsletter-translation" : "newsletter-body",
                  )
                  ?.focus()
              }
            />
          </div>
        }
        aside={
          <DetailsPanel title={m.docDetails()}>
            <DetailsSection title={m.nlSectionEdition()}>
              <SelectField
                id="newsletter-language"
                label={m.nlPrimaryLanguage()}
                hint={m.nlPrimaryLanguageHint()}
                value={draft.primaryLocale}
                options={NEWSLETTER_LOCALES.map((locale) => ({
                  value: locale,
                  label: LOCALE_LABEL[locale](),
                }))}
                onChange={(primaryLocale) => {
                  change({ primaryLocale });
                  setWriting(primaryLocale);
                }}
              />
              <CheckboxRow
                label={m.nlBilingual({ language: LOCALE_NAME[other]() })}
                hint={m.nlBilingualHint({
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
              <DetailsSection title={m.nlTranslation()}>
                <TranslationNote
                  state={translation}
                  review={review}
                  language={LOCALE_NAME[other]()}
                />
                <CheckboxRow
                  label={m.nlReviewed()}
                  hint={m.nlReviewedHint({
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
                  {m.nlShowOriginal({
                    language: LOCALE_NAME[draft.primaryLocale](),
                  })}
                </Button>
              </DetailsSection>
            ) : null}
            <DetailsSection
              title={m.annSectionAudience()}
              hint={m.annAudienceHint()}
            >
              <AudienceList
                value={draft.audiences}
                onChange={(audiences) => change({ audiences })}
                choices={options}
                error={null}
              />
            </DetailsSection>
            <DetailsSection title={m.annSectionDelivery()}>
              {live ? (
                <p className="text-[13px] leading-[18px] text-muted-foreground">
                  {m.nlPublishedHint()}
                </p>
              ) : (
                <FormField
                  id="newsletter-send-at"
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
              <span>{m.nlStartFrom()}</span>
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
          {draft.bilingual ? (
            <Tabs
              value={writing}
              onValueChange={(value: NewsletterLocale) => setWriting(value)}
            >
              <TabsList aria-label={m.nlLanguage()}>
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
          {editorFor(translating ? other : draft.primaryLocale)}
        </div>
      </DocumentPage>
      <SheetPanel
        open={comparing}
        onOpenChange={setComparing}
        title={m.nlOriginalTitle({
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
        title={m.nlPreview()}
      >
        <h2
          dir="auto"
          className="text-2xl leading-8 font-semibold tracking-tight"
        >
          {draft.title || m.nlUntitled()}
        </h2>
        <NewsletterView
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
