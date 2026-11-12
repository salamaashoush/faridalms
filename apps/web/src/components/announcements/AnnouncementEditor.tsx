import type {
  AudienceInput,
  Urgency,
  Visibility,
} from "@faridalms/domain/announcements";
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
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Archive, CalendarClock, Send } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  BuiltInGroup,
  StartingPiece,
} from "~/components/content/Templates";
import type { announcementEditorQuery } from "~/queries/announcements";

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
import { announcementOptionsQuery } from "~/queries/announcements";
import {
  archiveAnnouncement,
  getAnnouncementEditor,
  publishAnnouncement,
  reviewAnnouncementTranslation,
  saveAnnouncement,
} from "~/server/announcements";
import { instantFromLocal, localInput } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { AudienceList, audienceIssue, audienceSummary } from "./AudienceList";
import { STATE_LABEL, STATE_TONE, URGENCY_LABEL } from "./format";

type EditorData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof announcementEditorQuery>["queryFn"]>>
>;
type Options = Awaited<
  ReturnType<NonNullable<(typeof announcementOptionsQuery)["queryFn"]>>
>;
type Review = EditorData["translationReview"];

/** Everything an author sets on an announcement, as the editor holds it. */
interface Draft {
  primaryLocale: ContentLocale;
  bilingual: boolean;
  titleEn: string;
  titleAr: string;
  body: ContentDocument;
  translation: ContentDocument;
  audiences: AudienceInput[];
  urgency: Urgency;
  pinnedUntil: string;
  expiresOn: string;
  requiresAck: boolean;
  ackDueOn: string;
  visibility: Visibility;
  excerptEn: string;
  excerptAr: string;
  slug: string;
  categoryId: string;
  coverFileId: string;
  coverAltEn: string;
  coverAltAr: string;
  pinned: boolean;
}

function saveOf(draft: Draft, id: string, version: number) {
  const website = draft.visibility === "public";
  return saveAnnouncement({
    data: {
      id,
      expectedVersion: version,
      primaryLocale: draft.primaryLocale,
      titleEn: draft.titleEn.trim(),
      titleAr: draft.titleAr.trim(),
      body: draft.body,
      translation: draft.bilingual ? draft.translation : null,
      audiences: draft.audiences,
      urgency: draft.urgency,
      pinnedUntil: draft.pinnedUntil,
      expiresOn: draft.expiresOn,
      requiresAck: draft.requiresAck,
      ackDueOn: draft.requiresAck ? draft.ackDueOn : "",
      visibility: draft.visibility,
      excerptEn: draft.excerptEn.trim(),
      excerptAr: draft.excerptAr.trim(),
      slug: website ? draft.slug : "",
      categoryId: website ? draft.categoryId : "",
      coverFileId: draft.coverFileId,
      coverAltEn: draft.coverAltEn.trim(),
      coverAltAr: draft.coverAltAr.trim(),
      pinned: website && draft.pinned,
    },
  });
}

const FAMILIES: AudienceInput[] = [
  { scope: "families", classId: "", gradeId: "" },
];

const NEWSLETTERS = ["weekly", "monthly"] as const;
type Newsletter = (typeof NEWSLETTERS)[number];

const NEWSLETTER_LABEL: Record<Newsletter, () => string> = {
  weekly: m.annTemplateWeekly,
  monthly: m.annTemplateMonthly,
};

const NEWSLETTER_HINT: Record<Newsletter, () => string> = {
  weekly: m.annTemplateWeeklyHint,
  monthly: m.annTemplateMonthlyHint,
};

/** Starter headings, in the post's language rather than the writer's. */
const NEWSLETTER_HEADINGS: Record<
  Newsletter,
  ((inputs: object, options: { locale: ContentLocale }) => string)[]
> = {
  weekly: [m.annStarterPrincipal, m.annStarterWeek, m.annStarterDates],
  monthly: [
    m.annStarterPrincipal,
    m.annStarterHighlights,
    m.annStarterClasses,
    m.annStarterDates,
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
  return slug || `post-${Date.now().toString(36)}`;
}

const field = (name: string) => `announcement-${name}`;

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
function wordsProblems(draft: Draft): string[] {
  const other = otherLocale(draft.primaryLocale);
  const written = (locale: ContentLocale) =>
    locale === draft.primaryLocale ||
    (draft.bilingual && documentWritten(draft.translation));
  if (draft.visibility === "school")
    return [
      ...contentIssueMessages(draft.body),
      ...(written(other) ? contentIssueMessages(draft.translation) : []),
    ];
  // On the website it reads as a page under its title.
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

export interface AnnouncementEditorProps {
  existing: EditorData | null;
  /** The template a new one starts from. */
  template?: StartingPiece;
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}

/**
 * An announcement written as a document, to its audience, the website or
 * both. The title and words take the page, in its first language and the
 * other beside it; who it reaches and how it behaves sit beside them.
 * Everything saves itself as it is written, and its readers keep what they
 * were sent until an update goes out, which asks whether to tell them again.
 */
export function AnnouncementEditor({
  existing,
  template,
  onClose,
  onCreated,
}: AnnouncementEditorProps) {
  const options: Options = useSuspenseQuery(announcementOptionsQuery).data;
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
  const isPublic = draft.visibility === "public";
  const pictured = usePicturePeople(isPublic ? "website" : "news");
  const media = useMemo(
    () => ({ ...documentMedia, people: pictured.open }),
    [documentMedia, pictured.open],
  );
  const telling = draft.audiences.length > 0;
  const reachable =
    audienceIssue(draft.audiences) === null && (telling || isPublic);

  const persist = useCallback(
    async (value: Draft) => {
      if (!valid) throw new Error("content.invalid");
      const website = value.visibility === "public";
      if (website && !value.slug && !fallbackSlug.current)
        fallbackSlug.current = slugOf(value.titleEn.trim());
      const send = (slug: string) =>
        saveOf({ ...value, slug }, id.current, version.current);
      const slug = value.slug || fallbackSlug.current;
      // The address follows the title until the writer sets one, and another
      // post may already stand there; refusing it would refuse every save
      // of the draft's words after. It takes a free one instead, as a copy
      // of a post does, and the writer can still change it.
      const saved = await send(slug).catch(async (error: unknown) => {
        if (
          !website ||
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
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      if (created) onCreated(saved.id);
    },
    [valid, live, queryClient, onCreated],
  );

  const primaryTitle = pick(draft.primaryLocale, draft.titleEn, draft.titleAr);
  const titleOf = (value: Draft) =>
    pick(value.primaryLocale, value.titleEn, value.titleAr).trim() ||
    m.annUntitled();
  const { autosave, editing } = useHeldDocument({
    host: stored ? { hostType: "announcement", hostId: storedId } : null,
    value: draft,
    save: persist,
    // The server needs a title to list it by, and someone it can reach.
    enabled: state !== "archived" && primaryTitle.trim() !== "" && reachable,
    version: () => version.current,
    latest: async () => {
      const data = await getAnnouncementEditor({ data: { id: id.current } });
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

  const change = useCallback((patch: Partial<Draft>) => {
    setIssues([]);
    setDraft((current) => {
      const next = { ...current, ...patch };
      if (
        next.visibility === "public" &&
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

  const builtIn: BuiltInGroup = {
    label: m.annTemplateGroup(),
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
  };
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
  const wordIssues = wordsProblems(draft);

  const problems = () => {
    const found: string[] = [];
    if (!primaryTitle.trim()) found.push(m.annTitleNeeded());
    if (!documentWritten(draft.body)) found.push(m.annBodyNeeded());
    if (!reachable) {
      found.push(audienceIssue(draft.audiences) ?? m.annErrAudience());
      setDetailsOpen(true);
    }
    if (wordIssues.length) {
      found.push(...wordIssues);
      if (isPublic) setDetailsOpen(true);
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
      await publishAnnouncement({
        data: {
          id: id.current,
          expectedVersion: version.current,
          publishAt: later ? instantFromLocal(sendAt) : "",
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(later ? m.annScheduled() : m.annPublished());
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
      const out = await publishAnnouncement({
        data: {
          id: id.current,
          expectedVersion: version.current,
          sendUpdate: true,
          quietly: !notify,
        },
      });
      version.current = out.version;
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setChanged(false);
      setSent({
        body: draft.body,
        translation: draft.bilingual ? draft.translation : null,
      });
      setState("published");
      toast.success(m.annUpdateSent());
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
      const out = await reviewAnnouncementTranslation({
        data: {
          id: id.current,
          expectedVersion: version.current,
          reviewed,
        },
      });
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
        await archiveAnnouncement({
          data: { id: id.current, expectedVersion: version.current },
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      toast.success(m.annArchived());
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

  return (
    <>
      <DocumentPage
        heading={existing ? m.annEditTitle() : m.annNewTitle()}
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
                updateLabel: m.annSendUpdate(),
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
                onUpdate: () => setAsking(true),
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
        link={stored ? `/announcements/${storedId}` : undefined}
        preview={{ label: m.docPreview(), onClick: () => setPreviewing(true) }}
        templates={{
          kind: "announcement",
          empty: untouched,
          content: draft.body,
          title: primaryTitle,
          onApply: replaceBody,
          builtIn,
        }}
        comments={
          stored
            ? {
                hostType: "announcement",
                hostId: storedId,
                editor: field(translating ? "translation" : "body"),
                part: translating ? "translation" : "body",
              }
            : undefined
        }
        history={
          stored
            ? {
                hostType: "announcement",
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
                      title: primaryTitle.trim() || m.annUntitled(),
                    }),
                    body: m.annArchiveBody(),
                    label: m.annArchive(),
                  },
                },
              ]
            : []
        }
        summary={[
          ...(isPublic ? [m.annWherePublic()] : []),
          telling
            ? audienceSummary(draft.audiences, options)
            : m.annAudienceNone(),
          URGENCY_LABEL[draft.urgency](),
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
                placeholder={m.annUntitled()}
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
            {options.site || isPublic ? (
              <DetailsSection title={m.annColWhere()}>
                <CheckboxRow
                  label={m.annOnWebsiteCheck()}
                  hint={m.annOnWebsiteHint()}
                  checked={isPublic}
                  onChange={(checked) =>
                    change({
                      visibility: checked ? "public" : "school",
                      audiences:
                        !checked && !telling ? FAMILIES : draft.audiences,
                      slug:
                        checked && !draft.slug && draft.titleEn.trim()
                          ? slugOf(draft.titleEn)
                          : draft.slug,
                    })
                  }
                />
              </DetailsSection>
            ) : null}
            <DetailsSection
              title={m.annSectionAudience()}
              hint={isPublic ? m.annAudienceOptional() : m.annAudienceHint()}
            >
              {isPublic ? (
                <CheckboxRow
                  label={m.annTellPeople()}
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
            <WebsiteSettings
              draft={draft}
              shown={shown}
              excerptKey={excerptKey}
              altKey={altKey}
              options={options}
              problems={wordIssues}
              onPeople={pictured.open}
              onChange={change}
              onSlug={() => {
                slugTouched.current = true;
              }}
            />
            <DetailsSection title={m.annSectionDelivery()}>
              <AnnouncementSettings draft={draft} onChange={change} />
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
            m.annUntitled()}
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
  onChange: (patch: Partial<Draft>) => void;
}

/** How an announcement behaves for its readers: urgency, pinning, expiry and acknowledgement. */
function AnnouncementSettings({ draft, onChange }: AnnouncementSettingsProps) {
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

interface WebsiteSettingsProps {
  draft: Draft;
  shown: ContentLocale;
  excerptKey: "excerptEn" | "excerptAr";
  altKey: "coverAltEn" | "coverAltAr";
  options: Options;
  problems: string[];
  onPeople: (fileId: string) => void;
  onChange: (patch: Partial<Draft>) => void;
  onSlug: () => void;
}

/**
 * What an announcement carries for its cards: a summary, and on the website
 * its picture, category and address. A picture shows only on the website.
 */
function WebsiteSettings({
  draft,
  shown,
  excerptKey,
  altKey,
  options,
  problems,
  onPeople,
  onChange,
  onSlug,
}: WebsiteSettingsProps) {
  return (
    <>
      <DetailsSection title={m.annSummary()} hint={m.annSummaryHint()}>
        <FormField
          id={field("summary")}
          label={`${m.annSummary()} (${LOCALE_LABEL[shown]()})`}
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
      {draft.visibility === "public" ? (
        <DetailsSection title={m.annPicture()}>
          <PictureField
            fileId={draft.coverFileId || null}
            label={m.annPicture()}
            onChange={(fileId) => onChange({ coverFileId: fileId ?? "" })}
            fromMedia
            onPeople={onPeople}
          />
          {draft.coverFileId ? (
            <TextField
              id={field("picture-alt")}
              label={`${m.annPictureAlt()} (${LOCALE_LABEL[shown]()})`}
              lang={shown}
              dir={shown === "ar" ? "rtl" : "ltr"}
              maxLength={300}
              value={draft[altKey]}
              onChange={(event) => onChange({ [altKey]: event.target.value })}
            />
          ) : null}
        </DetailsSection>
      ) : null}
      {draft.visibility === "public" ? (
        <DetailsSection title={m.annOnWebsite()}>
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
