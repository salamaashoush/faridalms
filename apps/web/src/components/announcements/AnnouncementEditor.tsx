import type {
  AudienceInput,
  AudienceScope,
  Urgency,
} from "@faridalms/domain/announcements";
import type { ContentDocument } from "@faridalms/domain/content";

import { AUDIENCE_SCOPES, URGENCIES } from "@faridalms/domain/announcements";
import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { announcementEditorQuery } from "~/queries/announcements";

import { classTitle } from "~/components/classes/format";
import { ContentEditor } from "~/components/content/ContentEditor";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { CheckboxRow } from "~/components/people/fields";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { announcementOptionsQuery } from "~/queries/announcements";
import { publishAnnouncement, saveAnnouncement } from "~/server/announcements";
import { getMessageFromError } from "~/utils/error";

import { SCOPE_LABEL, URGENCY_LABEL } from "./format";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof announcementEditorQuery>["queryFn"]>>
>;

interface Draft {
  title: string;
  body: ContentDocument;
  audiences: AudienceInput[];
  urgency: Urgency;
  pinnedUntil: string;
  expiresOn: string;
  requiresAck: boolean;
  ackDueOn: string;
  when: "now" | "later";
  sendAt: string;
}

function draftOf(existing: Existing | null): Draft {
  return {
    title: existing?.title ?? "",
    body:
      (existing?.body as unknown as ContentDocument | null) ?? emptyContent(),
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
    when: "now",
    sendAt: "",
  };
}

/** Title, body, who it goes to, and how it behaves once out. */
export function AnnouncementEditor({
  existing,
  onClose,
}: {
  existing: Existing | null;
  onClose: (id?: string) => void;
}) {
  const options = useSuspenseQuery(announcementOptionsQuery).data;
  const queryClient = useQueryClient();
  const media = useDocumentMedia();
  const [initial] = useState(() => draftOf(existing));
  const [draft, setDraft] = useState(initial);
  const [shown, setShown] = useState(false);
  const leaving = useRef(false);
  const published = existing?.state === "published";
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = useMutation({
    mutationFn: () =>
      saveAnnouncement({
        data: {
          id: existing?.id ?? "",
          expectedVersion: existing?.version ?? 0,
          title: draft.title.trim(),
          body: draft.body,
          audiences: draft.audiences,
          urgency: draft.urgency,
          pinnedUntil: draft.pinnedUntil,
          expiresOn: draft.expiresOn,
          requiresAck: draft.requiresAck,
          ackDueOn: draft.requiresAck ? draft.ackDueOn : "",
        },
      }),
  });
  const publish = useMutation({
    mutationFn: (saved: { id: string; version: number }) =>
      publishAnnouncement({
        data: {
          id: saved.id,
          expectedVersion: saved.version,
          publishAt:
            draft.when === "later" && draft.sendAt
              ? new Date(draft.sendAt).toISOString()
              : "",
          sendUpdate: published,
        },
      }),
  });
  const issues = {
    title: draft.title.trim() ? null : m.annTitleNeeded(),
    audiences: draft.audiences.some(
      (row) =>
        (row.scope === "class" && !row.classId) ||
        (row.scope === "grade" && !row.gradeId),
    )
      ? m.annAudienceTarget()
      : null,
    sendAt:
      draft.when === "later" && !draft.sendAt ? m.annSendAtNeeded() : null,
  };
  const setAudience = (index: number, next: AudienceInput) =>
    set(
      "audiences",
      draft.audiences.map((row, at) => (at === index ? next : row)),
    );
  const failure = save.error ?? publish.error;
  return (
    <RecordForm
      title={existing ? m.annEditTitle() : m.annNewTitle()}
      submitLabel={published ? m.annSaveQuietly() : m.annSaveDraft()}
      secondary={
        published
          ? { label: m.annSaveAndUpdate(), intent: "publish" }
          : {
              label: draft.when === "later" ? m.annSchedule() : m.annPublish(),
              intent: "publish",
            }
      }
      onSubmit={async (intent) => {
        setShown(true);
        if (Object.values(issues).some(Boolean)) return;
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
        await queryClient.invalidateQueries({ queryKey: ["announcements"] });
        leaving.current = true;
        toast.success(
          intent === "publish"
            ? published
              ? m.annUpdateSent()
              : draft.when === "later"
                ? m.annScheduled()
                : m.annPublished()
            : m.annSaved(),
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
      <FormSection title={m.annSectionContent()}>
        <TextField
          id="announcement-title"
          label={m.annColTitle()}
          width="name"
          dir="auto"
          maxLength={200}
          autoComplete="off"
          value={draft.title}
          onChange={(event) => set("title", event.target.value)}
          errors={shown && issues.title ? [issues.title] : undefined}
        />
        <FormField id="announcement-body" label={m.annBody()}>
          {(control) => (
            <div className="min-w-0">
              <ContentEditor
                id={control.id}
                label={m.annBody()}
                value={draft.body}
                onChange={(value) => set("body", value)}
                media={media}
              />
            </div>
          )}
        </FormField>
      </FormSection>
      <FormSection
        title={m.annSectionAudience()}
        description={m.annAudienceHint()}
      >
        <div className="grid gap-3">
          {draft.audiences.map((row, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <SelectField
                id={`audience-${index}-scope`}
                label={m.annAudience()}
                labelHidden={index > 0}
                width="name"
                className="w-48"
                value={row.scope}
                options={AUDIENCE_SCOPES.map((scope) => ({
                  value: scope,
                  label: SCOPE_LABEL[scope](),
                }))}
                onChange={(scope: AudienceScope) =>
                  setAudience(index, { scope, classId: "", gradeId: "" })
                }
              />
              {row.scope === "class" ? (
                <SelectField
                  id={`audience-${index}-class`}
                  label={m.annClass()}
                  labelHidden={index > 0}
                  width="name"
                  className="w-48"
                  value={row.classId}
                  options={[
                    { value: "", label: m.annPickClass() },
                    ...options.classes.map((item) => ({
                      value: item.id,
                      label: classTitle(item),
                    })),
                  ]}
                  onChange={(classId) =>
                    setAudience(index, { ...row, classId })
                  }
                />
              ) : row.scope === "grade" ? (
                <SelectField
                  id={`audience-${index}-grade`}
                  label={m.annGrade()}
                  labelHidden={index > 0}
                  width="name"
                  className="w-48"
                  value={row.gradeId}
                  options={[
                    { value: "", label: m.annPickGrade() },
                    ...options.grades.map((item) => ({
                      value: item.id,
                      label: inLocale(item.labelEn, item.labelAr),
                    })),
                  ]}
                  onChange={(gradeId) =>
                    setAudience(index, { ...row, gradeId })
                  }
                />
              ) : null}
              {draft.audiences.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="max-md:size-10"
                  aria-label={m.annRemoveAudience()}
                  onClick={() =>
                    set(
                      "audiences",
                      draft.audiences.filter((_, at) => at !== index),
                    )
                  }
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </div>
          ))}
          {shown && issues.audiences ? (
            <p
              role="alert"
              className="text-[13px] leading-[18px] text-destructive"
            >
              {issues.audiences}
            </p>
          ) : null}
          {draft.audiences.length < 20 ? (
            <div>
              <Button
                type="button"
                variant="outline"
                className="max-md:h-10"
                onClick={() =>
                  set("audiences", [
                    ...draft.audiences,
                    { scope: "class", classId: "", gradeId: "" },
                  ])
                }
              >
                <Plus aria-hidden />
                {m.annAddAudience()}
              </Button>
            </div>
          ) : null}
        </div>
      </FormSection>
      <FormSection title={m.annSectionDelivery()}>
        <SelectField
          id="announcement-urgency"
          label={m.annColUrgency()}
          hint={m.annUrgencyHint()}
          width="name"
          value={draft.urgency}
          options={URGENCIES.map((urgency) => ({
            value: urgency,
            label: URGENCY_LABEL[urgency](),
          }))}
          onChange={(urgency) => set("urgency", urgency)}
        />
        <TextField
          id="announcement-pinned"
          label={m.annPinUntil()}
          hint={m.annPinHint()}
          optional
          type="date"
          width="date"
          value={draft.pinnedUntil}
          onChange={(event) => set("pinnedUntil", event.target.value)}
        />
        <TextField
          id="announcement-expires"
          label={m.annExpiresOn()}
          hint={m.annExpiresHint()}
          optional
          type="date"
          width="date"
          value={draft.expiresOn}
          onChange={(event) => set("expiresOn", event.target.value)}
        />
        <CheckboxRow
          label={m.annRequiresAck()}
          hint={m.annRequiresAckHint()}
          checked={draft.requiresAck}
          onChange={(checked) => set("requiresAck", checked)}
        />
        {draft.requiresAck ? (
          <TextField
            id="announcement-ack-due"
            label={m.annAckDueOn()}
            optional
            type="date"
            width="date"
            value={draft.ackDueOn}
            onChange={(event) => set("ackDueOn", event.target.value)}
          />
        ) : null}
        {published ? null : (
          <>
            <SelectField
              id="announcement-when"
              label={m.annWhen()}
              width="name"
              value={draft.when}
              options={[
                { value: "now", label: m.annWhenNow() },
                { value: "later", label: m.annWhenLater() },
              ]}
              onChange={(when) => set("when", when)}
            />
            {draft.when === "later" ? (
              <FormField
                id="announcement-send-at"
                label={m.annSendAt()}
                errors={shown && issues.sendAt ? [issues.sendAt] : undefined}
              >
                {(control) => (
                  <Input
                    {...control}
                    type="datetime-local"
                    className="w-60 max-md:h-10"
                    value={draft.sendAt}
                    onChange={(event) => set("sendAt", event.target.value)}
                  />
                )}
              </FormField>
            ) : null}
          </>
        )}
      </FormSection>
    </RecordForm>
  );
}
