import type { AudienceInput } from "@faridalms/domain/announcements";
import type { CalendarCategory } from "@faridalms/domain/calendar";
import type { ContentDocument } from "@faridalms/domain/content";

import {
  CALENDAR_CATEGORIES,
  materialChange,
} from "@faridalms/domain/calendar";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { Button } from "@faridalms/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@faridalms/ui/dialog";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Send, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import {
  AudienceList,
  audienceIssue,
  audienceSummary,
} from "~/components/announcements/AudienceList";
import { ContentEditor } from "~/components/content/ContentEditor";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { CheckboxRow } from "~/components/people/fields";
import {
  DetailsPanel,
  DetailsSection,
  DocumentPage,
  DocumentTitle,
} from "~/components/system/DocumentPage";
import { SelectField, TextField } from "~/components/system/field";
import { useAutosave } from "~/hooks/useAutosave";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { calendarEventQuery, calendarOptionsQuery } from "~/queries/calendar";
import {
  publishCalendarEvent,
  removeCalendarEvent,
  saveCalendarEvent,
} from "~/server/calendar";
import { getMessageFromError } from "~/utils/error";

import { CATEGORY_LABEL, whenLabel } from "./format";

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
  description: ContentDocument;
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
    description: existing?.description ?? emptyContent(),
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
  return whenLabel(
    {
      startsOn: draft.startsOn,
      endsOn,
      startTime: timed ? draft.startTime : null,
      endTime: timed ? draft.endTime : null,
    },
    "short",
  );
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
  day,
  manages,
  onClose,
  onCreated,
}: {
  existing: Existing | null;
  day: string;
  /** The author manages the whole calendar rather than their own classes. */
  manages: boolean;
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}) {
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
  const [pending, setPending] = useState<"publish" | "update" | null>(null);
  const live = state === "published";
  const issues = issuesOf(draft);
  const ready = !Object.values(issues).some(Boolean);
  const reached = latest?.reached ?? existing?.reached ?? 0;
  const cancelled = latest?.cancelled ?? existing?.cancelled ?? false;
  const tellChange = tellChoice ?? materialChange(plan(sent), plan(draft));

  const persist = useCallback(
    async (value: Draft, sendUpdate = false) => {
      if (!valid) throw new Error("content.invalid");
      const saved = await saveCalendarEvent({
        data: {
          id: id.current,
          expectedVersion: version.current,
          ...value,
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

  const inPanel = Boolean(
    issues.endsOn || issues.startTime || issues.endTime || issues.audiences,
  );

  const publish = async () => {
    setShown(true);
    if (inPanel) setDetailsOpen(true);
    if (!ready) return;
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
    if (!ready) return;
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

  const titleKey = getLocale() === "ar" ? "titleAr" : "titleEn";
  const otherKey = titleKey === "titleAr" ? "titleEn" : "titleAr";
  const changed = live && JSON.stringify(draft) !== JSON.stringify(sent);
  const listed = Object.values(issues).filter((issue) => issue !== null);
  const errorOf = (issue: string | null) =>
    shown && issue ? [issue] : undefined;

  return (
    <>
      <DocumentPage
        heading={existing ? m.calEditTitle() : m.calNewTitle()}
        print={{
          title: inLocale(draft.titleEn, draft.titleAr),
          facts: (locale) => [
            ...(draft.startsOn && draft.endsOn
              ? [
                  whenLabel(
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
              <TextField
                id="event-other-title"
                label={otherKey === "titleAr" ? m.calTitleAr() : m.calTitleEn()}
                hint={m.calTitleHint()}
                optional
                dir={otherKey === "titleAr" ? "rtl" : "ltr"}
                maxLength={200}
                autoComplete="off"
                value={draft[otherKey]}
                onChange={(event) => change({ [otherKey]: event.target.value })}
              />
            </DetailsSection>
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
        <ContentEditor
          key={editorKey}
          id="event-body"
          label={m.calDescription()}
          variant="document"
          value={draft.description}
          onChange={changeDescription}
          onValidityChange={setValid}
          onUploadingChange={setUploading}
          media={media}
        />
      </DocumentPage>
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
