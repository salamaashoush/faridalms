import type { AudienceInput, Urgency } from "@faridalms/domain/announcements";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";

import { URGENCIES } from "@faridalms/domain/announcements";
import { contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  CONTENT_LOCALES,
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
import { Input } from "@faridalms/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Archive, CalendarClock, Send } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { StartingPiece } from "~/components/content/Templates";
import type { announcementEditorQuery } from "~/queries/announcements";

import { contentIssueMessages } from "~/components/content/checks";
import { ContentEditor } from "~/components/content/ContentEditor";
import { ContentView } from "~/components/content/ContentView";
import { LOCALE_LABEL, LOCALE_NAME } from "~/components/content/languages";
import { useStartFrom } from "~/components/content/Templates";
import { TranslationNote } from "~/components/content/TranslationNote";
import { CheckboxRow } from "~/components/people/fields";
import {
  DetailsPanel,
  DetailsSection,
  DocumentPage,
  DocumentTitle,
} from "~/components/system/DocumentPage";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { SheetPanel } from "~/components/system/SheetPanel";
import { useAutosave } from "~/hooks/useAutosave";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { announcementOptionsQuery } from "~/queries/announcements";
import {
  archiveAnnouncement,
  publishAnnouncement,
  reviewAnnouncementTranslation,
  saveAnnouncement,
} from "~/server/announcements";
import { instantFromLocal, localInput } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { AudienceList, audienceIssue, audienceSummary } from "./AudienceList";
import { STATE_LABEL, STATE_TONE, URGENCY_LABEL } from "./format";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof announcementEditorQuery>["queryFn"]>>
>;
type Review = Existing["translationReview"];

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
}

function draftOf(existing: Existing | null): Draft {
  return {
    primaryLocale:
      existing?.primaryLocale ?? (getLocale() === "ar" ? "ar" : "en"),
    bilingual: existing ? existing.translation !== null : false,
    titleEn: existing?.titleEn ?? "",
    titleAr: existing?.titleAr ?? "",
    body:
      (existing?.body as unknown as ContentDocument | null) ?? emptyContent(),
    translation:
      (existing?.translation as unknown as ContentDocument | null) ??
      emptyContent(),
    audiences: existing?.audiences.length
      ? existing.audiences.map((row) => ({
          scope: row.scope,
          classId: row.classId ?? "",
          gradeId: row.gradeId ?? "",
        }))
      : [{ scope: "families", classId: "", gradeId: "" }],
    urgency: existing?.urgency ?? "normal",
    pinnedUntil: existing?.pinnedUntil ?? "",
    expiresOn: existing?.expiresOn ?? "",
    requiresAck: existing?.requiresAck ?? false,
    ackDueOn: existing?.ackDueOn ?? "",
  };
}

/**
 * An announcement written as a document: the title and body take the page,
 * who it reaches and how it behaves sit beside it. Drafts save themselves;
 * sending tells its audience once, and later edits wait for Update, which
 * asks whether to tell them again.
 */
export function AnnouncementEditor({
  existing,
  template,
  onClose,
  onCreated,
}: {
  existing: Existing | null;
  /** The library piece a new announcement starts from. */
  template?: StartingPiece;
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}) {
  const options = useSuspenseQuery(announcementOptionsQuery).data;
  const queryClient = useQueryClient();
  const media = useDocumentMedia();
  const id = useRef(existing?.id ?? "");
  const version = useRef(existing?.version ?? 0);
  const [storedId, setStoredId] = useState(existing?.id ?? "");
  const stored = storedId !== "";
  const [state, setState] = useState(existing?.shown ?? "draft");
  const [draft, setDraft] = useState<Draft>(() => draftOf(existing));
  const [sent, setSent] = useState<Draft>(draft);
  const [sendAt, setSendAt] = useState(localInput(existing?.publishAt));
  const [editorKey, setEditorKey] = useState(0);
  const [valid, setValid] = useState(true);
  // Publishing waits for files still uploading, or they would be left out.
  const [uploading, setUploading] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [pending, setPending] = useState<"send" | "update" | "archive" | null>(
    null,
  );
  const [asking, setAsking] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [review, setReview] = useState<Review>(
    existing?.translationReview ?? null,
  );
  const [reviewing, setReviewing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [writing, setWriting] = useState<ContentLocale>(
    () => existing?.primaryLocale ?? (getLocale() === "ar" ? "ar" : "en"),
  );
  const live = state === "published";
  const other = otherLocale(draft.primaryLocale);
  const translating = draft.bilingual && writing === other;
  const shown: ContentLocale = translating ? other : draft.primaryLocale;
  const titleKey = shown === "ar" ? "titleAr" : "titleEn";
  const primaryTitle =
    draft.primaryLocale === "ar" ? draft.titleAr : draft.titleEn;

  const persist = useCallback(
    async (value: Draft) => {
      if (!valid) throw new Error("content.invalid");
      const saved = await saveAnnouncement({
        data: {
          id: id.current,
          expectedVersion: version.current,
          primaryLocale: value.primaryLocale,
          titleEn: value.titleEn.trim(),
          titleAr: value.titleAr.trim(),
          body: value.body,
          translation: value.bilingual ? value.translation : null,
          audiences: value.audiences,
          urgency: value.urgency,
          pinnedUntil: value.pinnedUntil,
          expiresOn: value.expiresOn,
          requiresAck: value.requiresAck,
          ackDueOn: value.requiresAck ? value.ackDueOn : "",
        },
      });
      const created = !id.current;
      id.current = saved.id;
      version.current = saved.version;
      setStoredId(saved.id);
      setReview(saved.translationReview);
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      if (created) onCreated(saved.id);
    },
    [valid, queryClient, onCreated],
  );

  // A draft can only be stored once it has a title to list it by.
  const autosave = useAutosave({
    value: draft,
    save: persist,
    enabled: !live && state !== "archived" && primaryTitle.trim() !== "",
  });

  const change = useCallback((patch: Partial<Draft>) => {
    setIssues([]);
    setDraft((current) => ({ ...current, ...patch }));
  }, []);
  const changeBody = useCallback(
    (body: ContentDocument) => change({ body }),
    [change],
  );
  const applyBody = (body: ContentDocument) => {
    change({ body });
    setEditorKey((key) => key + 1);
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
    setReviewing(true);
    try {
      await persist(draft);
      autosave.markSaved(draft);
      const out = await reviewAnnouncementTranslation({
        data: { id: id.current, expectedVersion: version.current, reviewed },
      });
      version.current = out.version;
      setReview(out.review);
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setReviewing(false);
    }
  };

  const problems = () => {
    const found: string[] = [];
    if (!primaryTitle.trim()) found.push(m.annTitleNeeded());
    if (!contentPlainText(draft.body).trim()) found.push(m.annBodyNeeded());
    found.push(
      ...contentIssueMessages(draft.body),
      ...(draft.bilingual ? contentIssueMessages(draft.translation) : []),
    );
    const audience = audienceIssue(draft.audiences);
    if (audience) {
      found.push(audience);
      setDetailsOpen(true);
    }
    return found;
  };

  const later = sendAt !== "";

  const send = async () => {
    const found = problems();
    setIssues(found);
    if (found.length) return;
    setPending("send");
    try {
      await persist(draft);
      autosave.markSaved(draft);
      await publishAnnouncement({
        data: {
          id: id.current,
          expectedVersion: version.current,
          publishAt: instantFromLocal(sendAt),
          sendUpdate: false,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(later ? m.annScheduled() : m.annPublished());
      onClose(id.current);
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setPending(null);
    }
  };

  const update = async (notify: boolean) => {
    const found = problems();
    setIssues(found);
    setAsking(false);
    if (found.length) return;
    setPending("update");
    try {
      await persist(draft);
      const sentNow = await publishAnnouncement({
        data: {
          id: id.current,
          expectedVersion: version.current,
          publishAt: "",
          sendUpdate: true,
          quietly: !notify,
        },
      });
      version.current = sentNow.version;
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      setSent(draft);
      setState("published");
      toast.success(notify ? m.annUpdateSent() : m.annSaved());
    } catch (error) {
      toast.error(getMessageFromError(error));
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
      toast.error(getMessageFromError(error));
      setPending(null);
    }
  };

  const changed = live && JSON.stringify(draft) !== JSON.stringify(sent);

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
        status={{
          label: STATE_LABEL[state](),
          tone: STATE_TONE[state],
        }}
        saveState={autosave.state}
        onRetry={autosave.retry}
        templates={{
          kind: "announcement",
          empty: !stored && !contentPlainText(draft.body).trim(),
          content: draft.body,
          title: primaryTitle,
          onApply: applyBody,
        }}
        unpublished={
          changed
            ? {
                pending: pending === "update" || uploading,
                onDiscard: () => {
                  setDraft(sent);
                  setEditorKey((key) => key + 1);
                },
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
                pending: pending === "send",
                disabled: uploading,
                onClick: () => void send(),
              }
        }
        link={stored ? `/announcements/${storedId}` : undefined}
        preview={
          stored
            ? {
                label: m.docPreview(),
                onClick: () =>
                  window.open(
                    `/announcements/${id.current}`,
                    "_blank",
                    "noopener",
                  ),
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
        title={
          <div className="grid gap-3">
            {issues.length ? (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
              >
                <p className="font-medium">{m.annIncomplete()}</p>
                <ul className="mt-1 list-disc ps-5">
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
                id="announcement-title"
                label={m.docTitle()}
                placeholder={m.annUntitled()}
                maxLength={200}
                value={draft[titleKey]}
                onChange={(title) => change({ [titleKey]: title })}
                onEnter={() =>
                  document
                    .getElementById(
                      translating
                        ? "announcement-translation"
                        : "announcement-body",
                    )
                    ?.focus()
                }
              />
            </div>
          </div>
        }
        summary={[
          audienceSummary(draft.audiences, options),
          URGENCY_LABEL[draft.urgency](),
          draft.bilingual
            ? m.contentBothLanguages()
            : LOCALE_LABEL[draft.primaryLocale](),
        ]}
        details={{ open: detailsOpen, onOpenChange: setDetailsOpen }}
        aside={
          <DetailsPanel title={m.docDetails()}>
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
            <DetailsSection title={m.contentSectionLanguages()}>
              <SelectField
                id="announcement-language"
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
                    if (!reviewing) void markReviewed(checked);
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
            <DetailsSection title={m.annSectionDelivery()}>
              <SelectField
                id="announcement-urgency"
                label={m.annColUrgency()}
                hint={m.annUrgencyHint()}
                value={draft.urgency}
                options={URGENCIES.map((urgency) => ({
                  value: urgency,
                  label: URGENCY_LABEL[urgency](),
                }))}
                onChange={(urgency) => change({ urgency })}
              />
              <TextField
                id="announcement-pinned"
                label={m.annPinUntil()}
                hint={m.annPinHint()}
                optional
                type="date"
                value={draft.pinnedUntil}
                onChange={(event) =>
                  change({ pinnedUntil: event.target.value })
                }
              />
              <TextField
                id="announcement-expires"
                label={m.annExpiresOn()}
                hint={m.annExpiresHint()}
                optional
                type="date"
                value={draft.expiresOn}
                onChange={(event) => change({ expiresOn: event.target.value })}
              />
              <CheckboxRow
                label={m.annRequiresAck()}
                hint={m.annRequiresAckHint()}
                checked={draft.requiresAck}
                onChange={(requiresAck) => change({ requiresAck })}
              />
              {draft.requiresAck ? (
                <TextField
                  id="announcement-ack-due"
                  label={m.annAckDueOn()}
                  optional
                  type="date"
                  value={draft.ackDueOn}
                  onChange={(event) => change({ ackDueOn: event.target.value })}
                />
              ) : null}
              {live ? null : (
                <FormField
                  id="announcement-send-at"
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
            id={translating ? "announcement-translation" : "announcement-body"}
            label={
              translating
                ? `${m.translationTitle()} (${LOCALE_LABEL[shown]()})`
                : m.annBody()
            }
            variant="document"
            value={translating ? draft.translation : draft.body}
            onChange={translating ? changeTranslation : changeBody}
            onValidityChange={setValid}
            onUploadingChange={setUploading}
            media={media}
            sharedBlocks
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
            document={draft.body}
            fileUrl={(fileId) => `/files/${fileId}`}
          />
        </div>
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
