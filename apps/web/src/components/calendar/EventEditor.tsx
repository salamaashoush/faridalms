import type { AudienceInput } from "@faridalms/domain/announcements";
import type { CalendarCategory } from "@faridalms/domain/calendar";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";

import {
  CALENDAR_CATEGORIES,
  materialChange,
} from "@faridalms/domain/calendar";
import { contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  CONTENT_LOCALES,
  documentWritten,
  otherLocale,
  translationState,
} from "@faridalms/domain/translations";
import { Button } from "@faridalms/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@faridalms/ui/dialog";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { SheetPanel } from "@faridalms/ui/system/sheet-panel";
import { Tabs, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Send, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  BuiltInGroup,
  BuiltInPiece,
  StartingPiece,
} from "~/components/content/Templates";

import {
  AudienceList,
  audienceIssue,
  audienceSummary,
} from "~/components/broadcasts/AudienceList";
import { contentIssueMessages } from "~/components/content/checks";
import { ContentEditor } from "~/components/content/ContentEditor";
import { ContentView } from "~/components/content/ContentView";
import { LOCALE_LABEL, LOCALE_NAME } from "~/components/content/languages";
import { sectionsContent } from "~/components/content/shapes";
import { useStartFrom } from "~/components/content/Templates";
import { TranslationNote } from "~/components/content/TranslationNote";
import { sayIn } from "~/components/learning/starters";
import { CheckboxRow } from "~/components/people/fields";
import {
  DetailsPanel,
  DetailsSection,
  DocumentPage,
  DocumentTitle,
} from "~/components/system/DocumentPage";
import { useAutosave } from "~/hooks/useAutosave";
import { inLocale } from "~/hooks/useCurrentUser";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { calendarEventQuery, calendarOptionsQuery } from "~/queries/calendar";
import {
  publishCalendarEvent,
  removeCalendarEvent,
  reviewCalendarTranslation,
  saveCalendarEvent,
} from "~/server/calendar";
import { formatSpan } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { EVENT_SHAPES } from "./eventShapes";
import { CATEGORY_LABEL } from "./format";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof calendarEventQuery>["queryFn"]>>
>;

interface Draft {
  titleEn: string;
  titleAr: string;
  public: boolean;
  category: CalendarCategory;
  startsOn: string;
  endsOn: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  provisional: boolean;
  audiences: AudienceInput[];
  primaryLocale: ContentLocale;
  bilingual: boolean;
  description: ContentDocument;
  translation: ContentDocument;
}

function draftOf(
  existing: Existing | null,
  day: string,
  manages: boolean,
): Draft {
  return {
    titleEn: existing?.titleEn ?? "",
    titleAr: existing?.titleAr ?? "",
    public: existing?.public ?? false,
    category: existing?.category ?? "general",
    startsOn: existing?.startsOn ?? day,
    endsOn: existing?.endsOn ?? day,
    allDay: existing ? existing.startTime === null : false,
    startTime: existing?.startTime ?? "09:00",
    endTime: existing?.endTime ?? "10:00",
    location: existing?.location ?? "",
    provisional: existing?.provisional ?? false,
    audiences: existing?.audiences.length
      ? existing.audiences.map((row) => ({
          scope: row.scope,
          classId: row.classId ?? "",
          gradeId: row.gradeId ?? "",
        }))
      : [
          manages
            ? { scope: "school", classId: "", gradeId: "" }
            : { scope: "class", classId: "", gradeId: "" },
        ],
    primaryLocale:
      existing?.primaryLocale ?? (getLocale() === "ar" ? "ar" : "en"),
    bilingual: existing ? existing.translation !== null : false,
    description: existing?.description ?? emptyContent(),
    translation: existing?.translation ?? emptyContent(),
  };
}

const plan = (value: Draft) => ({
  ...value,
  startTime: value.allDay ? null : value.startTime,
  endTime: value.allDay ? null : value.endTime,
  location: value.location.trim() || null,
});

function issuesOf(draft: Draft) {
  return {
    title:
      draft.titleEn.trim() || draft.titleAr.trim() ? null : m.calTitleNeeded(),
    endsOn: draft.endsOn < draft.startsOn ? m.calEndsBefore() : null,
    startTime:
      !draft.allDay && (!draft.startTime || !draft.endTime)
        ? m.calTimesNeeded()
        : null,
    endTime:
      !draft.allDay &&
      draft.startTime &&
      draft.endTime &&
      draft.startsOn === draft.endsOn &&
      draft.endTime <= draft.startTime
        ? m.calEndsBefore()
        : null,
    audiences: audienceIssue(draft.audiences),
  };
}

function draftWhen(draft: Draft) {
  if (!draft.startsOn) return "";
  const endsOn = draft.endsOn >= draft.startsOn ? draft.endsOn : draft.startsOn;
  const timed =
    !draft.allDay &&
    draft.startTime !== "" &&
    draft.endTime !== "" &&
    (endsOn > draft.startsOn || draft.endTime > draft.startTime);
  return formatSpan(
    {
      startsOn: draft.startsOn,
      endsOn,
      startTime: timed ? draft.startTime : null,
      endTime: timed ? draft.endTime : null,
    },
    "short",
  );
}

function shapeGroup(): BuiltInGroup {
  const say = sayIn(getLocale() === "ar" ? "ar" : "en");
  return {
    label: m.eventShapeGroup(),
    items: EVENT_SHAPES.map((shape) => ({
      key: shape.key,
      title: shape.title(),
      hint: shape.hint(),
      content: () => sectionsContent(shape.sections, say),
    })),
  };
}

export interface EventEditorProps {
  existing: Existing | null;
  /** A library piece a new event starts from. */
  template?: StartingPiece;
  day: string;
  /** The author manages the whole calendar rather than their own classes. */
  manages: boolean;
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}

/**
 * An event written as a document: the title and description take the page,
 * when, where and who it is for sit beside them. Drafts save themselves once
 * they could be stored; publishing tells its people if the author says so,
 * and edits after that wait for Update, which asks whether to tell them,
 * pre-ticked when the date, time, place or audience moved.
 */
export function EventEditor({
  existing,
  template,
  day,
  manages,
  onClose,
  onCreated,
}: EventEditorProps) {
  const options = useSuspenseQuery(calendarOptionsQuery).data;
  const queryClient = useQueryClient();
  const media = useDocumentMedia();
  const id = useRef(existing?.id ?? "");
  const version = useRef(existing?.version ?? 0);
  const [storedId, setStoredId] = useState(existing?.id ?? "");
  const latest = useQuery({
    ...calendarEventQuery(storedId),
    enabled: storedId !== "",
  }).data;
  const [state, setState] = useState(existing?.state ?? "draft");
  const [draft, setDraft] = useState(() => draftOf(existing, day, manages));
  const [sent, setSent] = useState(draft);
  const [editorKey, setEditorKey] = useState(0);
  const [valid, setValid] = useState(true);
  // Publishing waits for files still uploading, or they would be left out.
  const [uploading, setUploading] = useState(false);
  const [shown, setShown] = useState(false);
  const [tellOnPublish, setTellOnPublish] = useState(true);
  const [tellChoice, setTellChoice] = useState<boolean | null>(null);
  const [asking, setAsking] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pending, setPending] = useState<
    "publish" | "update" | "review" | null
  >(null);
  const [writing, setWriting] = useState<ContentLocale>(draft.primaryLocale);
  const [review, setReview] = useState(existing?.translationReview ?? null);
  const [comparing, setComparing] = useState(false);
  const other = otherLocale(draft.primaryLocale);
  const translating = draft.bilingual && writing === other;
  const shownLocale: ContentLocale = translating ? other : draft.primaryLocale;
  const live = state === "published";
  const issues = issuesOf(draft);
  const ready = !Object.values(issues).some(Boolean);
  // A draft saves as it is; only what readers would meet waits for these.
  const contentProblems = [
    ...contentIssueMessages(draft.description),
    ...(draft.bilingual && documentWritten(draft.translation)
      ? contentIssueMessages(draft.translation)
      : []),
  ];
  const reached = latest?.reached ?? existing?.reached ?? 0;
  const cancelled = latest?.cancelled ?? existing?.cancelled ?? false;
  const tellChange = tellChoice ?? materialChange(plan(sent), plan(draft));

  const persist = useCallback(
    async (value: Draft, sendUpdate = false) => {
      if (!valid) throw new Error("content.invalid");
      const { bilingual, translation, ...fields } = value;
      const saved = await saveCalendarEvent({
        data: {
          id: id.current,
          expectedVersion: version.current,
          ...fields,
          translation: bilingual ? translation : null,
          titleEn: value.titleEn.trim(),
          titleAr: value.titleAr.trim(),
          startTime: value.allDay ? "" : value.startTime,
          endTime: value.allDay ? "" : value.endTime,
          sendUpdate,
        },
      });
      const created = !id.current;
      id.current = saved.id;
      version.current = saved.version;
      setStoredId(saved.id);
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
      if (created) onCreated(saved.id);
    },
    [valid, queryClient, onCreated],
  );

  // The server refuses a draft with no title or impossible times, so one is
  // stored only once it could be.
  const autosave = useAutosave({
    value: draft,
    save: persist,
    enabled: !live && ready,
  });

  const change = useCallback((patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);
  const changeDescription = useCallback(
    (description: ContentDocument) => change({ description }),
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
  // The check is taken against the original as stored, so what is on screen
  // is saved first.
  const markReviewed = async (reviewed: boolean) => {
    setPending("review");
    try {
      await persist(draft);
      autosave.markSaved(draft);
      const out = await reviewCalendarTranslation({
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
  // A school trip's shape makes the event a trip, and so on.
  const applyDescription = (
    description: ContentDocument,
    shape?: BuiltInPiece,
  ) => {
    const category = CALENDAR_CATEGORIES.find((key) => key === shape?.key);
    change({ description, ...(category ? { category } : {}) });
    setEditorKey((key) => key + 1);
  };
  useStartFrom(
    template,
    useCallback((piece: StartingPiece) => {
      setDraft((current) => {
        const key = getLocale() === "ar" ? "titleAr" : "titleEn";
        return {
          ...current,
          description: piece.content,
          [key]: current[key] || piece.title,
        };
      });
      setEditorKey((key) => key + 1);
    }, []),
  );

  const inPanel = Boolean(
    issues.endsOn || issues.startTime || issues.endTime || issues.audiences,
  );

  const publish = async () => {
    setShown(true);
    if (inPanel) setDetailsOpen(true);
    if (!ready || contentProblems.length > 0) return;
    setPending("publish");
    try {
      autosave.markSaved(draft);
      await persist(draft);
      const out = await publishCalendarEvent({
        data: {
          id: id.current,
          expectedVersion: version.current,
          notify: tellOnPublish,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
      setState("published");
      toast.success(
        out.told > 0
          ? m.calPublishedTold({ count: out.told })
          : m.calPublished(),
      );
      onClose(id.current);
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setPending(null);
    }
  };

  const update = async () => {
    setShown(true);
    if (inPanel) setDetailsOpen(true);
    setAsking(false);
    if (!ready || contentProblems.length > 0) return;
    setPending("update");
    try {
      await persist(draft, tellChange);
      setSent(draft);
      setTellChoice(null);
      toast.success(m.calSaved());
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setPending(null);
    }
  };

  const titleKey = shownLocale === "ar" ? "titleAr" : "titleEn";
  const otherKey = draft.primaryLocale === "ar" ? "titleEn" : "titleAr";
  const changed = live && JSON.stringify(draft) !== JSON.stringify(sent);
  const listed = [
    ...Object.values(issues).filter((issue) => issue !== null),
    ...contentProblems,
  ];
  const errorOf = (issue: string | null) =>
    shown && issue ? [issue] : undefined;

  return (
    <>
      <DocumentPage
        heading={existing ? m.calEditTitle() : m.calNewTitle()}
        templates={{
          kind: "event",
          empty: !contentPlainText(draft.description).trim(),
          content: draft.description,
          title: inLocale(draft.titleEn, draft.titleAr),
          onApply: applyDescription,
          builtIn: shapeGroup(),
        }}
        print={{
          title: inLocale(draft.titleEn, draft.titleAr),
          facts: (locale) => [
            ...(draft.startsOn && draft.endsOn
              ? [
                  formatSpan(
                    {
                      startsOn: draft.startsOn,
                      endsOn: draft.endsOn,
                      startTime: draft.allDay ? null : draft.startTime || null,
                      endTime: draft.allDay ? null : draft.endTime || null,
                    },
                    "long",
                    locale,
                  ),
                ]
              : []),
            ...(draft.location.trim() ? [draft.location.trim()] : []),
          ],
          content: draft.description,
        }}
        onBack={async () => {
          if (await autosave.flush()) onClose(id.current || undefined);
        }}
        status={
          live
            ? cancelled
              ? { label: m.calCancelled(), tone: "danger" }
              : { label: m.calStatePublished(), tone: "success" }
            : { label: m.calDraft(), tone: "neutral" }
        }
        saveState={autosave.state}
        onRetry={autosave.retry}
        unpublished={
          changed
            ? {
                pending: pending === "update" || uploading,
                onDiscard: () => {
                  setDraft(sent);
                  setTellChoice(null);
                  setEditorKey((key) => key + 1);
                },
                onUpdate: () => setAsking(true),
              }
            : undefined
        }
        primary={
          live
            ? undefined
            : {
                label: m.calPublish(),
                icon: Send,
                pending: pending === "publish",
                disabled: uploading,
                onClick: () => void publish(),
              }
        }
        link={storedId ? `/calendar/${storedId}` : undefined}
        preview={
          storedId
            ? {
                label: m.docPreview(),
                onClick: () =>
                  window.open(`/calendar/${storedId}`, "_blank", "noopener"),
              }
            : undefined
        }
        menu={
          storedId && !live
            ? [
                {
                  label: m.calDelete(),
                  icon: Trash2,
                  destructive: true,
                  confirm: {
                    title: m.calDeleteTitle(),
                    body: m.calDeleteBody(),
                    label: m.calDelete(),
                  },
                  onSelect: async () => {
                    autosave.markSaved(draft);
                    await removeCalendarEvent({
                      data: {
                        id: id.current,
                        expectedVersion: version.current,
                      },
                    });
                    await queryClient.invalidateQueries({
                      queryKey: ["calendar"],
                    });
                    toast.success(m.calDeleted());
                    onClose();
                  },
                },
              ]
            : []
        }
        title={
          <div className="grid gap-3">
            {shown && listed.length > 0 ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                <ul className="list-disc ps-5">
                  {listed.map((issue) => (
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
            <DocumentTitle
              id="event-title"
              label={titleKey === "titleEn" ? m.calTitleEn() : m.calTitleAr()}
              placeholder={m.calUntitled()}
              maxLength={200}
              value={draft[titleKey]}
              onChange={(title) => change({ [titleKey]: title })}
              onEnter={() => document.getElementById("event-body")?.focus()}
            />
          </div>
        }
        summary={[
          draftWhen(draft),
          draft.location.trim(),
          audienceSummary(draft.audiences, options),
        ]}
        details={{ open: detailsOpen, onOpenChange: setDetailsOpen }}
        aside={
          <DetailsPanel title={m.docDetails()}>
            <DetailsSection title={m.calSectionWhen()}>
              <TextField
                id="event-starts"
                label={m.calStartsOn()}
                type="date"
                value={draft.startsOn}
                onChange={(event) => {
                  const startsOn = event.target.value;
                  setDraft((current) => ({
                    ...current,
                    startsOn,
                    endsOn:
                      current.endsOn < startsOn ? startsOn : current.endsOn,
                  }));
                }}
              />
              <TextField
                id="event-ends"
                label={m.calEndsOn()}
                type="date"
                min={draft.startsOn}
                value={draft.endsOn}
                onChange={(event) => change({ endsOn: event.target.value })}
                errors={errorOf(issues.endsOn)}
              />
              <CheckboxRow
                label={m.calAllDay()}
                checked={draft.allDay}
                onChange={(allDay) => change({ allDay })}
              />
              {draft.allDay ? null : (
                <div className="grid grid-cols-2 items-start gap-3">
                  <TextField
                    id="event-start-time"
                    label={m.calStartTime()}
                    type="time"
                    value={draft.startTime}
                    onChange={(event) =>
                      change({ startTime: event.target.value })
                    }
                    errors={errorOf(issues.startTime)}
                  />
                  <TextField
                    id="event-end-time"
                    label={m.calEndTime()}
                    type="time"
                    value={draft.endTime}
                    onChange={(event) =>
                      change({ endTime: event.target.value })
                    }
                    errors={errorOf(issues.endTime)}
                  />
                </div>
              )}
              <CheckboxRow
                label={m.calProvisionalLabel()}
                hint={m.calProvisionalHint()}
                checked={draft.provisional}
                onChange={(provisional) => change({ provisional })}
              />
            </DetailsSection>
            <DetailsSection title={m.calSectionEvent()}>
              <SelectField
                id="event-category"
                label={m.calCategory()}
                value={draft.category}
                options={CALENDAR_CATEGORIES.map((category) => ({
                  value: category,
                  label: CATEGORY_LABEL[category](),
                }))}
                onChange={(category) => change({ category })}
              />
              <TextField
                id="event-location"
                label={m.calWhere()}
                optional
                dir="auto"
                maxLength={200}
                autoComplete="off"
                value={draft.location}
                onChange={(event) => change({ location: event.target.value })}
              />
              {draft.bilingual ? null : (
                <TextField
                  id="event-other-title"
                  label={
                    otherKey === "titleAr" ? m.calTitleAr() : m.calTitleEn()
                  }
                  hint={m.calTitleHint()}
                  optional
                  dir={otherKey === "titleAr" ? "rtl" : "ltr"}
                  maxLength={200}
                  autoComplete="off"
                  value={draft[otherKey]}
                  onChange={(event) =>
                    change({ [otherKey]: event.target.value })
                  }
                />
              )}
            </DetailsSection>
            <DetailsSection title={m.contentSectionLanguages()}>
              <SelectField
                id="event-language"
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
            <DetailsSection
              title={m.calSectionFor()}
              hint={m.annAudienceHint()}
            >
              <AudienceList
                value={draft.audiences}
                onChange={(audiences) => change({ audiences })}
                choices={options}
                error={shown ? issues.audiences : null}
                scopes={manages ? undefined : ["class"]}
              />
            </DetailsSection>
            {manages ? (
              <DetailsSection title={m.calSectionWebsite()}>
                <CheckboxRow
                  label={m.calPublicLabel()}
                  hint={m.calPublicHint()}
                  checked={draft.public}
                  onChange={(value) => change({ public: value })}
                />
              </DetailsSection>
            ) : null}
            {live ? null : (
              <DetailsSection title={m.calSectionTelling()}>
                <CheckboxRow
                  label={m.calTellOnPublish()}
                  hint={m.calTellOnPublishHint()}
                  checked={tellOnPublish}
                  onChange={setTellOnPublish}
                />
              </DetailsSection>
            )}
          </DetailsPanel>
        }
      >
        <div lang={shownLocale} className="min-w-0">
          <ContentEditor
            key={`${editorKey}-${shownLocale}`}
            id="event-body"
            label={
              translating
                ? `${m.calDescription()} (${LOCALE_LABEL[shownLocale]()})`
                : m.calDescription()
            }
            variant="document"
            value={translating ? draft.translation : draft.description}
            onChange={translating ? changeTranslation : changeDescription}
            onValidityChange={setValid}
            onUploadingChange={setUploading}
            media={media}
          />
        </div>
      </DocumentPage>
      <SheetPanel
        open={comparing}
        onOpenChange={setComparing}
        title={m.translationOriginalTitle({
          language: LOCALE_NAME[draft.primaryLocale](),
        })}
      >
        <div lang={draft.primaryLocale}>
          <ContentView
            document={draft.description}
            fileUrl={(fileId) => `/files/${fileId}`}
          />
        </div>
      </SheetPanel>
      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.calUpdateTitle()}</DialogTitle>
            <DialogDescription>{m.calUpdateBody()}</DialogDescription>
          </DialogHeader>
          <CheckboxRow
            label={m.calTellChange({ count: reached })}
            hint={m.calTellChangeHint()}
            checked={tellChange}
            onChange={setTellChoice}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending === "update"}
              onClick={() => setAsking(false)}
            >
              {m.commonCancel()}
            </Button>
            <Button
              type="button"
              disabled={pending === "update"}
              onClick={() => void update()}
            >
              {m.docUpdate()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
