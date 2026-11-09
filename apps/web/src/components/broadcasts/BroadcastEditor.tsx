import type { AudienceInput } from "@faridalms/domain/announcements";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";

import { URGENCIES } from "@faridalms/domain/announcements";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@faridalms/ui/dialog";
import { Input } from "@faridalms/ui/input";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { SheetPanel } from "@faridalms/ui/system/sheet-panel";
import { Tabs, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import { Textarea } from "@faridalms/ui/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarClock, Send } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  BuiltInGroup,
  StartingPiece,
} from "~/components/content/Templates";

import { contentIssueMessages } from "~/components/content/checks";
import { ContentEditor } from "~/components/content/ContentEditor";
import { ContentView } from "~/components/content/ContentView";
import {
  DocumentVersion,
  documentText,
  useHeldDocument,
} from "~/components/content/held-document";
import { LOCALE_LABEL, LOCALE_NAME } from "~/components/content/languages";
import { useStartFrom } from "~/components/content/Templates";
import { TranslatedView } from "~/components/content/TranslatedView";
import { TranslationNote } from "~/components/content/TranslationNote";
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
import { inLocale } from "~/hooks/useCurrentUser";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { instantFromLocal, localInput } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type {
  BroadcastKind,
  Draft,
  EditorData,
  KindView,
  Options,
} from "./kinds";

import { AudienceList, audienceIssue, audienceSummary } from "./AudienceList";
import { STATE_LABEL, STATE_TONE, URGENCY_LABEL } from "./format";
import { KINDS } from "./kinds";

type Review = EditorData["translationReview"];

const FAMILIES: AudienceInput[] = [
  { scope: "families", classId: "", gradeId: "" },
];

const NEWSLETTERS = ["weekly", "monthly"] as const;
type Newsletter = (typeof NEWSLETTERS)[number];

const NEWSLETTER_LABEL: Record<Newsletter, () => string> = {
  weekly: m.newsTemplateWeekly,
  monthly: m.newsTemplateMonthly,
};

const NEWSLETTER_HINT: Record<Newsletter, () => string> = {
  weekly: m.newsTemplateWeeklyHint,
  monthly: m.newsTemplateMonthlyHint,
};

/** Starter headings, in the post's language rather than the writer's. */
const NEWSLETTER_HEADINGS: Record<
  Newsletter,
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

function draftOf(existing: EditorData | null): Draft {
  return {
    primaryLocale:
      existing?.primaryLocale ?? (getLocale() === "ar" ? "ar" : "en"),
    bilingual: existing ? existing.translation !== null : false,
    titleEn: existing?.titleEn ?? "",
    titleAr: existing?.titleAr ?? "",
    body: existing?.body ?? emptyContent(),
    translation: existing?.translation ?? emptyContent(),
    audiences: existing
      ? existing.audiences.map((row) => ({
          scope: row.scope,
          classId: row.classId ?? "",
          gradeId: row.gradeId ?? "",
        }))
      : FAMILIES,
    urgency: existing?.urgency ?? "normal",
    pinnedUntil: existing?.pinnedUntil ?? "",
    expiresOn: existing?.expiresOn ?? "",
    requiresAck: existing?.requiresAck ?? false,
    ackDueOn: existing?.ackDueOn ?? "",
    visibility: existing?.visibility ?? "school",
    excerptEn: existing?.excerptEn ?? "",
    excerptAr: existing?.excerptAr ?? "",
    slug: existing?.slug ?? "",
    categoryId: existing?.categoryId ?? "",
    coverFileId: existing?.coverFileId ?? "",
    coverAltEn: existing?.coverAltEn ?? "",
    coverAltAr: existing?.coverAltAr ?? "",
    pinned: existing?.pinned ?? false,
  };
}

/** What stops the words going out, as the server would refuse them, in the writer's words. */
function wordsProblems(view: KindView, draft: Draft): string[] {
  const other = otherLocale(draft.primaryLocale);
  const written = (locale: ContentLocale) =>
    locale === draft.primaryLocale ||
    (draft.bilingual && documentWritten(draft.translation));
  if (view.kind === "announcement")
    return [
      ...contentIssueMessages(draft.body),
      ...(written(other) ? contentIssueMessages(draft.translation) : []),
    ];
  // A post reads as a page under its title, wherever it is shown.
  return [draft.primaryLocale, other].filter(written).flatMap((locale) =>
    postIssues({
      coverFileId: draft.coverFileId || null,
      coverAlt: pick(locale, draft.coverAltEn, draft.coverAltAr),
      body: locale === draft.primaryLocale ? draft.body : draft.translation,
    }).map((code) =>
      m.siteIssueIn({
        issue: ISSUE_LABEL[code](),
        language: LOCALE_NAME[locale](),
      }),
    ),
  );
}

export interface BroadcastEditorProps {
  kind: BroadcastKind;
  existing: EditorData | null;
  /** The template a new one starts from. */
  template?: StartingPiece;
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}

/**
 * A broadcast written as a document: an announcement to its audience, or a
 * news post to its audience, the website or both. The title and words take
 * the page, in its first language and the other beside it; who it reaches
 * and how it behaves sit beside them. Everything saves itself as it is
 * written, and its readers keep what they were sent until an update goes
 * out, which for an announcement asks whether to tell them again.
 */
export function BroadcastEditor({
  kind,
  existing,
  template,
  onClose,
  onCreated,
}: BroadcastEditorProps) {
  const view = KINDS[kind];
  const options = view.useOptions();
  const queryClient = useQueryClient();
  const documentMedia = useDocumentMedia();
  const id = useRef(existing?.id ?? "");
  const version = useRef(existing?.version ?? 0);
  const slugTouched = useRef(Boolean(existing));
  // A post saved before it has an English title keeps one address after.
  const fallbackSlug = useRef(existing?.slug ?? "");
  const [storedId, setStoredId] = useState(existing?.id ?? "");
  const stored = storedId !== "";
  const [state, setState] = useState(existing?.shown ?? "draft");
  const [draft, setDraft] = useState<Draft>(() => draftOf(existing));
  const [sent, setSent] = useState(existing?.sent ?? null);
  const [changed, setChanged] = useState(existing?.changedSince ?? false);
  const [review, setReview] = useState<Review>(
    existing?.translationReview ?? null,
  );
  const [writing, setWriting] = useState<ContentLocale>(
    () => existing?.primaryLocale ?? (getLocale() === "ar" ? "ar" : "en"),
  );
  const [sendAt, setSendAt] = useState(
    state === "scheduled" ? localInput(existing?.publishAt) : "",
  );
  const [editorKey, setEditorKey] = useState(0);
  const [valid, setValid] = useState(true);
  // Publishing waits for files still uploading, or they would be left out.
  const [uploading, setUploading] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [pending, setPending] = useState<
    "publish" | "update" | "review" | "archive" | null
  >(null);
  const [asking, setAsking] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [previewLocale, setPreviewLocale] = useState<ContentLocale>(
    draft.primaryLocale,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const live = state === "published";
  const other = otherLocale(draft.primaryLocale);
  const isNews = kind === "news";
  const isPublic = isNews && draft.visibility === "public";
  const pictured = usePicturePeople(isPublic ? "website" : "news");
  const media = useMemo(
    () => ({ ...documentMedia, people: pictured.open }),
    [documentMedia, pictured.open],
  );
  const telling = draft.audiences.length > 0;
  const reachable =
    audienceIssue(draft.audiences) === null &&
    (telling || (view.audienceOptional && isPublic));

  const persist = useCallback(
    async (value: Draft) => {
      if (!valid) throw new Error("content.invalid");
      const englishTitle = value.titleEn.trim();
      if (isNews && !value.slug && !fallbackSlug.current)
        fallbackSlug.current = slugOf(englishTitle);
      const send = (slug: string) =>
        view.save(
          isNews ? { ...value, slug } : value,
          id.current,
          version.current,
        );
      const slug = value.slug || fallbackSlug.current;
      // The address follows the title until the writer sets one, and another
      // post may already stand there; refusing it would refuse every save
      // of the draft's words after. It takes a free one instead, as a copy
      // of a post does, and the writer can still change it.
      const saved = await send(slug).catch(async (error: unknown) => {
        if (
          !isNews ||
          slugTouched.current ||
          !(error instanceof Error) ||
          error.message !== "site.slug_taken"
        )
          throw error;
        const free = `${slug.slice(0, 60)}-${Date.now().toString(36)}`;
        fallbackSlug.current = free;
        setDraft((current) =>
          current.slug === value.slug ? { ...current, slug: free } : current,
        );
        return send(free);
      });
      const created = !id.current;
      id.current = saved.id;
      version.current = saved.version;
      setStoredId(saved.id);
      setReview(saved.translationReview);
      if (live) setChanged(true);
      await queryClient.invalidateQueries({ queryKey: [view.queryKey] });
      if (created) onCreated(saved.id);
    },
    [valid, isNews, view, live, queryClient, onCreated],
  );

  const primaryTitle = pick(draft.primaryLocale, draft.titleEn, draft.titleAr);
  const titleOf = (value: Draft) =>
    pick(value.primaryLocale, value.titleEn, value.titleAr).trim() ||
    view.copy.untitled();
  const { autosave, editing } = useHeldDocument({
    host: stored ? { hostType: kind, hostId: storedId } : null,
    value: draft,
    save: persist,
    // The server needs a title to list it by, and someone it can reach.
    enabled: state !== "archived" && primaryTitle.trim() !== "" && reachable,
    version: () => version.current,
    latest: async () => {
      const data = await view.loadEditor(id.current);
      return { value: draftOf(data), version: data.version, data };
    },
    adopt: ({ value, version: kept, data }) => {
      version.current = kept;
      setDraft(value);
      setState(data.shown);
      setSent(data.sent);
      setChanged(data.changedSince);
      setReview(data.translationReview);
      setWriting(value.primaryLocale);
      setEditorKey((key) => key + 1);
    },
    rebase: (kept) => {
      version.current = kept;
    },
    render: (value) => (
      <DocumentVersion
        title={titleOf(value)}
        body={value.body}
        lang={value.primaryLocale}
      />
    ),
    text: (value) => documentText(titleOf(value), value.body),
  });
  const failed = (error: unknown) => {
    if (!editing.handles(error)) toast.error(getMessageFromError(error));
  };

  const change = useCallback(
    (patch: Partial<Draft>) => {
      setIssues([]);
      setDraft((current) => {
        const next = { ...current, ...patch };
        if (
          isNews &&
          patch.titleEn !== undefined &&
          !slugTouched.current &&
          patch.titleEn.trim()
        )
          next.slug = slugOf(patch.titleEn);
        return next;
      });
    },
    [isNews],
  );
  const changeBody = useCallback(
    (body: ContentDocument) => change({ body }),
    [change],
  );
  const changeTranslation = useCallback(
    (translation: ContentDocument) => change({ translation }),
    [change],
  );
  const replaceBody = (body: ContentDocument) => {
    change({ body });
    setEditorKey((key) => key + 1);
  };

  const translation = draft.bilingual
    ? translationState({
        translation: draft.translation,
        reviewed: review !== null,
        current: review?.current ?? false,
      })
    : null;

  const builtIn: BuiltInGroup | undefined = isNews
    ? {
        label: m.newsTemplateGroup(),
        items: NEWSLETTERS.map((starter) => ({
          key: starter,
          title: NEWSLETTER_LABEL[starter](),
          hint: NEWSLETTER_HINT[starter](),
          content: () =>
            headedContent(
              NEWSLETTER_HEADINGS[starter].map((heading) => ({
                heading: heading({}, { locale: draft.primaryLocale }),
                body: emptyContent(),
              })),
            ),
        })),
      }
    : undefined;
  useStartFrom(
    template,
    useCallback((piece: StartingPiece) => {
      setDraft((current) => {
        const key = current.primaryLocale === "ar" ? "titleAr" : "titleEn";
        return {
          ...current,
          body: piece.content,
          [key]: current[key] || piece.title,
        };
      });
      setEditorKey((key) => key + 1);
    }, []),
  );

  const later = !live && sendAt !== "";
  const wordIssues = wordsProblems(view, draft);

  const problems = () => {
    const found: string[] = [];
    if (!primaryTitle.trim()) found.push(view.copy.titleNeeded());
    if (!documentWritten(draft.body)) found.push(view.copy.bodyNeeded());
    if (!reachable) {
      found.push(audienceIssue(draft.audiences) ?? m.newsErrAudience());
      setDetailsOpen(true);
    }
    if (wordIssues.length) {
      found.push(...wordIssues);
      if (isNews) setDetailsOpen(true);
    }
    return found;
  };

  const send = async () => {
    const found = problems();
    setIssues(found);
    if (found.length) return;
    setPending("publish");
    try {
      await persist(draft);
      autosave.markSaved(draft);
      await view.publish({
        id: id.current,
        expectedVersion: version.current,
        publishAt: later ? instantFromLocal(sendAt) : "",
        revision: "first",
      });
      await queryClient.invalidateQueries({ queryKey: [view.queryKey] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(later ? view.copy.scheduled() : view.copy.published());
      onClose(id.current);
    } catch (error) {
      failed(error);
    } finally {
      setPending(null);
    }
  };

  /** Replaces what readers have with what is written now, told again or quietly. */
  const update = async (notify: boolean) => {
    const found = problems();
    setIssues(found);
    setAsking(false);
    if (found.length) return;
    setPending("update");
    try {
      await persist(draft);
      autosave.markSaved(draft);
      const out = await view.publish({
        id: id.current,
        expectedVersion: version.current,
        publishAt: "",
        revision: notify ? "telling" : "quietly",
      });
      version.current = out.version;
      await queryClient.invalidateQueries({ queryKey: [view.queryKey] });
      setChanged(false);
      setSent({
        body: draft.body,
        translation: draft.bilingual ? draft.translation : null,
      });
      setState("published");
      toast.success(view.copy.revised());
    } catch (error) {
      failed(error);
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
      const out = await view.review(id.current, version.current, reviewed);
      version.current = out.version;
      setReview(out.review);
    } catch (error) {
      failed(error);
    } finally {
      setPending(null);
    }
  };

  const archive = async () => {
    setPending("archive");
    try {
      if (id.current) {
        await autosave.flush();
        await view.archive(id.current, version.current);
      }
      await queryClient.invalidateQueries({ queryKey: [view.queryKey] });
      toast.success(view.copy.archived());
      onClose();
    } catch (error) {
      failed(error);
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
  const field = (name: string) => `${view.prefix}-${name}`;

  return (
    <>
      <DocumentPage
        heading={existing ? view.copy.editTitle() : view.copy.newTitle()}
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
        unpublished={
          live && changed
            ? {
                waiting: m.bcastWaiting(),
                pending: pending === "update" || uploading,
                updateLabel: view.copy.revise(),
                onDiscard: sent
                  ? () => {
                      change({
                        body: sent.body,
                        translation: sent.translation ?? emptyContent(),
                        bilingual: sent.translation !== null,
                      });
                      setWriting(draft.primaryLocale);
                      setEditorKey((key) => key + 1);
                      setChanged(false);
                    }
                  : undefined,
                onUpdate: () =>
                  kind === "announcement"
                    ? setAsking(true)
                    : void update(false),
              }
            : undefined
        }
        primary={
          live || state === "archived"
            ? undefined
            : {
                label: later ? m.annSchedule() : m.annPublish(),
                icon: later ? CalendarClock : Send,
                pending: pending === "publish",
                disabled: uploading,
                onClick: () => void send(),
              }
        }
        link={stored ? view.recordPath(storedId) : undefined}
        preview={{ label: m.docPreview(), onClick: () => setPreviewing(true) }}
        templates={{
          kind,
          empty: untouched,
          content: draft.body,
          title: primaryTitle,
          onApply: replaceBody,
          ...(builtIn ? { builtIn } : {}),
        }}
        comments={
          stored
            ? {
                hostType: kind,
                hostId: storedId,
                editor: field(translating ? "translation" : "body"),
                part: translating ? "translation" : "body",
              }
            : undefined
        }
        history={
          stored
            ? {
                hostType: kind,
                hostId: storedId,
                onRestore: (content) => {
                  setWriting(draft.primaryLocale);
                  replaceBody(content);
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
                      title: primaryTitle.trim() || view.copy.untitled(),
                    }),
                    body: m.annArchiveBody(),
                    label: m.annArchive(),
                  },
                },
              ]
            : []
        }
        summary={[
          ...(isNews
            ? [isPublic ? m.newsWherePublic() : m.newsWhereSchool()]
            : []),
          telling
            ? audienceSummary(draft.audiences, options)
            : m.newsAudienceNone(),
          ...(isNews ? [] : [URGENCY_LABEL[draft.urgency]()]),
          draft.bilingual
            ? m.contentBothLanguages()
            : LOCALE_LABEL[draft.primaryLocale](),
        ]}
        details={{ open: detailsOpen, onOpenChange: setDetailsOpen }}
        editing={editing}
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
                id={field("title")}
                label={m.docTitle()}
                placeholder={view.copy.untitled()}
                maxLength={200}
                value={draft[titleKey]}
                onChange={(title) => change({ [titleKey]: title })}
                onEnter={() =>
                  document
                    .getElementById(field(translating ? "translation" : "body"))
                    ?.focus()
                }
              />
            </div>
          </div>
        }
        aside={
          <DetailsPanel title={m.docDetails()}>
            {isNews ? (
              <DetailsSection title={m.newsWhere()} hint={m.newsWhereHint()}>
                <SelectField
                  id={field("where")}
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
            ) : null}
            <DetailsSection
              title={isNews ? m.newsAudience() : m.annSectionAudience()}
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
              {telling || !isPublic ? (
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
                id={field("language")}
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
                <TranslationNote
                  state={translation}
                  review={review}
                  language={LOCALE_NAME[other]()}
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
            {isNews ? (
              <NewsSettings
                draft={draft}
                shown={shown}
                excerptKey={excerptKey}
                altKey={altKey}
                options={options}
                problems={wordIssues}
                field={field}
                onPeople={pictured.open}
                onChange={change}
                onSlug={() => {
                  slugTouched.current = true;
                }}
              />
            ) : null}
            <DetailsSection title={m.annSectionDelivery()}>
              {isNews ? null : (
                <AnnouncementSettings
                  draft={draft}
                  field={field}
                  onChange={change}
                />
              )}
              {live ? (
                <p className="text-[13px] leading-[18px] text-muted-foreground">
                  {m.bcastPublishedHint()}
                </p>
              ) : (
                <FormField
                  id={field("send-at")}
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
        <div lang={shown} className="min-w-0">
          <ContentEditor
            key={`${editorKey}-${shown}`}
            id={field(translating ? "translation" : "body")}
            label={
              translating
                ? `${m.translationTitle()} (${LOCALE_LABEL[shown]()})`
                : LOCALE_LABEL[shown]()
            }
            variant="document"
            value={translating ? draft.translation : draft.body}
            onChange={translating ? changeTranslation : changeBody}
            onValidityChange={setValid}
            onUploadingChange={setUploading}
            media={media}
            sharedBlocks
            disabled={!editing.editable}
          />
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
        title={m.docPreview()}
      >
        <h2
          dir="auto"
          className="text-2xl leading-8 font-semibold tracking-tight"
        >
          {pick(previewLocale, draft.titleEn, draft.titleAr) ||
            primaryTitle ||
            view.copy.untitled()}
        </h2>
        <TranslatedView
          body={draft.body}
          translation={draft.bilingual ? draft.translation : null}
          primary={draft.primaryLocale}
          locale={draft.bilingual ? previewLocale : draft.primaryLocale}
          onLocaleChange={setPreviewLocale}
        />
      </SheetPanel>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.annUpdateTitle()}</DialogTitle>
            <DialogDescription>{m.annUpdateBody()}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending === "update"}
              onClick={() => void update(false)}
            >
              {m.annSaveQuietly()}
            </Button>
            <Button
              type="button"
              disabled={pending === "update"}
              onClick={() => void update(true)}
            >
              {m.annSaveAndUpdate()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface AnnouncementSettingsProps {
  draft: Draft;
  field: (name: string) => string;
  onChange: (patch: Partial<Draft>) => void;
}

/** How an announcement behaves for its readers: urgency, pinning, expiry and acknowledgement. */
function AnnouncementSettings({
  draft,
  field,
  onChange,
}: AnnouncementSettingsProps) {
  return (
    <>
      <SelectField
        id={field("urgency")}
        label={m.annColUrgency()}
        hint={m.annUrgencyHint()}
        value={draft.urgency}
        options={URGENCIES.map((urgency) => ({
          value: urgency,
          label: URGENCY_LABEL[urgency](),
        }))}
        onChange={(urgency) => onChange({ urgency })}
      />
      <TextField
        id={field("pinned")}
        label={m.annPinUntil()}
        hint={m.annPinHint()}
        optional
        type="date"
        value={draft.pinnedUntil}
        onChange={(event) => onChange({ pinnedUntil: event.target.value })}
      />
      <TextField
        id={field("expires")}
        label={m.annExpiresOn()}
        hint={m.annExpiresHint()}
        optional
        type="date"
        value={draft.expiresOn}
        onChange={(event) => onChange({ expiresOn: event.target.value })}
      />
      <CheckboxRow
        label={m.annRequiresAck()}
        hint={m.annRequiresAckHint()}
        checked={draft.requiresAck}
        onChange={(requiresAck) => onChange({ requiresAck })}
      />
      {draft.requiresAck ? (
        <TextField
          id={field("ack-due")}
          label={m.annAckDueOn()}
          optional
          type="date"
          value={draft.ackDueOn}
          onChange={(event) => onChange({ ackDueOn: event.target.value })}
        />
      ) : null}
    </>
  );
}

interface NewsSettingsProps {
  draft: Draft;
  shown: ContentLocale;
  excerptKey: "excerptEn" | "excerptAr";
  altKey: "coverAltEn" | "coverAltAr";
  options: Options;
  problems: string[];
  field: (name: string) => string;
  onPeople: (fileId: string) => void;
  onChange: (patch: Partial<Draft>) => void;
  onSlug: () => void;
}

/** What a news post carries for its cards and the website: summary, picture and address. */
function NewsSettings({
  draft,
  shown,
  excerptKey,
  altKey,
  options,
  problems,
  field,
  onPeople,
  onChange,
  onSlug,
}: NewsSettingsProps) {
  return (
    <>
      <DetailsSection title={m.newsSummary()} hint={m.newsSummaryHint()}>
        <FormField
          id={field("summary")}
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
                onChange({ [excerptKey]: event.target.value })
              }
            />
          )}
        </FormField>
      </DetailsSection>
      <DetailsSection title={m.newsPicture()}>
        <PictureField
          fileId={draft.coverFileId || null}
          label={m.newsPicture()}
          onChange={(fileId) => onChange({ coverFileId: fileId ?? "" })}
          fromLibrary
          onPeople={onPeople}
        />
        {draft.coverFileId ? (
          <TextField
            id={field("picture-alt")}
            label={`${m.newsPictureAlt()} (${LOCALE_LABEL[shown]()})`}
            lang={shown}
            dir={shown === "ar" ? "rtl" : "ltr"}
            maxLength={300}
            value={draft[altKey]}
            onChange={(event) => onChange({ [altKey]: event.target.value })}
          />
        ) : null}
      </DetailsSection>
      {draft.visibility === "public" ? (
        <DetailsSection title={m.newsWebsite()}>
          <SelectField
            id={field("category")}
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
            onChange={(categoryId) => onChange({ categoryId })}
          />
          <TextField
            id={field("slug")}
            label={m.siteSlug()}
            hint={m.sitePostSlugHint({ slug: draft.slug || "…" })}
            dir="ltr"
            maxLength={80}
            autoComplete="off"
            value={draft.slug}
            onChange={(event) => {
              onSlug();
              onChange({ slug: event.target.value.toLowerCase() });
            }}
          />
          <CheckboxRow
            label={m.sitePinPost()}
            hint={m.sitePinPostHint()}
            checked={draft.pinned}
            onChange={(pinned) => onChange({ pinned })}
          />
          {problems.length ? (
            <ul className="grid gap-1 text-[13px] leading-[18px] text-destructive">
              {problems.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </DetailsSection>
      ) : null}
    </>
  );
}
