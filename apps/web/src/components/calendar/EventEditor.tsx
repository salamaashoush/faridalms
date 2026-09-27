import type { AudienceInput } from "@faridalms/domain/announcements";
import type { CalendarCategory } from "@faridalms/domain/calendar";
import type { ContentDocument } from "@faridalms/domain/content";

import {
  CALENDAR_CATEGORIES,
  materialChange,
} from "@faridalms/domain/calendar";
import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { calendarEventQuery } from "~/queries/calendar";

import {
  AudienceList,
  audienceIssue,
} from "~/components/announcements/AudienceList";
import { ContentEditor } from "~/components/content/ContentEditor";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { CheckboxRow } from "~/components/people/fields";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import * as m from "~/i18n/messages";
import { calendarOptionsQuery } from "~/queries/calendar";
import { publishCalendarEvent, saveCalendarEvent } from "~/server/calendar";
import { getMessageFromError } from "~/utils/error";

import { CATEGORY_LABEL } from "./format";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof calendarEventQuery>["queryFn"]>>
>;

interface Draft {
  title: string;
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
    title: existing?.title ?? "",
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

/**
 * What happens, when and where, and who it is for. A new event is a draft
 * until published; a published one tells its people of a change only when
 * the author says so, pre-ticked when the date, time, place or audience moved.
 */
export function EventEditor({
  existing,
  day,
  manages,
  onClose,
}: {
  existing: Existing | null;
  day: string;
  /** The author manages the whole calendar rather than their own classes. */
  manages: boolean;
  onClose: (id?: string) => void;
}) {
  const options = useSuspenseQuery(calendarOptionsQuery).data;
  const queryClient = useQueryClient();
  const media = useDocumentMedia();
  const [initial] = useState(() => draftOf(existing, day, manages));
  const [draft, setDraft] = useState(initial);
  const [shown, setShown] = useState(false);
  const published = existing?.state === "published";
  const [tellOnPublish, setTellOnPublish] = useState(true);
  const [tellChoice, setTellChoice] = useState<boolean | null>(null);
  const tellChange = tellChoice ?? materialChange(plan(initial), plan(draft));
  const leaving = useRef(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const saved = await saveCalendarEvent({
        data: {
          id: existing?.id ?? "",
          expectedVersion: existing?.version ?? 0,
          ...draft,
          title: draft.title.trim(),
          startTime: draft.allDay ? "" : draft.startTime,
          endTime: draft.allDay ? "" : draft.endTime,
          sendUpdate: published && tellChange,
        },
      });
      if (!publish) return { ...saved, told: 0 };
      const out = await publishCalendarEvent({
        data: {
          id: saved.id,
          expectedVersion: saved.version,
          notify: tellOnPublish,
        },
      });
      return { ...saved, told: out.told };
    },
  });
  const issues = {
    title: draft.title.trim() ? null : m.calTitleNeeded(),
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
  return (
    <RecordForm
      title={existing ? m.calEditTitle() : m.calNewTitle()}
      submitLabel={published ? m.commonSave() : m.calPublish()}
      secondary={
        published ? undefined : { label: m.calSaveDraft(), intent: "draft" }
      }
      onSubmit={async (intent) => {
        setShown(true);
        if (Object.values(issues).some(Boolean)) return;
        const publish = !published && intent !== "draft";
        let saved: { id: string; version: number; told: number };
        try {
          saved = await save.mutateAsync(publish);
        } catch {
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["calendar"] });
        leaving.current = true;
        toast.success(
          publish
            ? saved.told > 0
              ? m.calPublishedTold({ count: saved.told })
              : m.calPublished()
            : published
              ? m.calSaved()
              : m.calDraftSaved(),
        );
        onClose(saved.id);
      }}
      onCancel={() => onClose()}
      isDirty={() =>
        !leaving.current && JSON.stringify(draft) !== JSON.stringify(initial)
      }
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
    >
      <FormSection title={m.calSectionEvent()}>
        <TextField
          id="event-title"
          label={m.annColTitle()}
          width="name"
          dir="auto"
          maxLength={200}
          autoComplete="off"
          value={draft.title}
          onChange={(event) => set("title", event.target.value)}
          errors={shown && issues.title ? [issues.title] : undefined}
        />
        <SelectField
          id="event-category"
          label={m.calCategory()}
          width="name"
          value={draft.category}
          options={CALENDAR_CATEGORIES.map((category) => ({
            value: category,
            label: CATEGORY_LABEL[category](),
          }))}
          onChange={(category) => set("category", category)}
        />
        <TextField
          id="event-location"
          label={m.calWhere()}
          optional
          width="name"
          dir="auto"
          maxLength={200}
          autoComplete="off"
          value={draft.location}
          onChange={(event) => set("location", event.target.value)}
        />
      </FormSection>
      <FormSection title={m.calSectionWhen()}>
        <div className="flex flex-wrap items-start gap-4">
          <TextField
            id="event-starts"
            label={m.calStartsOn()}
            type="date"
            width="date"
            value={draft.startsOn}
            onChange={(event) => {
              const startsOn = event.target.value;
              setDraft((current) => ({
                ...current,
                startsOn,
                endsOn: current.endsOn < startsOn ? startsOn : current.endsOn,
              }));
            }}
          />
          <TextField
            id="event-ends"
            label={m.calEndsOn()}
            type="date"
            width="date"
            min={draft.startsOn}
            value={draft.endsOn}
            onChange={(event) => set("endsOn", event.target.value)}
            errors={shown && issues.endsOn ? [issues.endsOn] : undefined}
          />
        </div>
        <CheckboxRow
          label={m.calAllDay()}
          checked={draft.allDay}
          onChange={(allDay) => set("allDay", allDay)}
        />
        {draft.allDay ? null : (
          <div className="flex flex-wrap items-start gap-4">
            <TextField
              id="event-start-time"
              label={m.calStartTime()}
              type="time"
              width="date"
              value={draft.startTime}
              onChange={(event) => set("startTime", event.target.value)}
              errors={
                shown && issues.startTime ? [issues.startTime] : undefined
              }
            />
            <TextField
              id="event-end-time"
              label={m.calEndTime()}
              type="time"
              width="date"
              value={draft.endTime}
              onChange={(event) => set("endTime", event.target.value)}
              errors={shown && issues.endTime ? [issues.endTime] : undefined}
            />
          </div>
        )}
        <CheckboxRow
          label={m.calProvisionalLabel()}
          hint={m.calProvisionalHint()}
          checked={draft.provisional}
          onChange={(provisional) => set("provisional", provisional)}
        />
      </FormSection>
      <FormSection title={m.calSectionFor()} description={m.annAudienceHint()}>
        <AudienceList
          value={draft.audiences}
          onChange={(audiences) => set("audiences", audiences)}
          choices={options}
          error={shown ? issues.audiences : null}
          scopes={manages ? undefined : ["class"]}
        />
      </FormSection>
      <FormSection title={m.calSectionDetails()}>
        <FormField id="event-description" label={m.calDescription()} optional>
          {(control) => (
            <div className="min-w-0">
              <ContentEditor
                id={control.id}
                label={m.calDescription()}
                value={draft.description}
                onChange={(description) => set("description", description)}
                media={media}
              />
            </div>
          )}
        </FormField>
      </FormSection>
      <FormSection title={m.calSectionTelling()}>
        {published ? (
          <CheckboxRow
            label={m.calTellChange({ count: existing.reached })}
            hint={m.calTellChangeHint()}
            checked={tellChange}
            onChange={setTellChoice}
          />
        ) : (
          <CheckboxRow
            label={m.calTellOnPublish()}
            hint={m.calTellOnPublishHint()}
            checked={tellOnPublish}
            onChange={setTellOnPublish}
          />
        )}
      </FormSection>
    </RecordForm>
  );
}
