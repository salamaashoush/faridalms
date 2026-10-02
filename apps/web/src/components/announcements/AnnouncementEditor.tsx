import type { AudienceInput, Urgency } from "@faridalms/domain/announcements";
import type { ContentDocument } from "@faridalms/domain/content";

import { URGENCIES } from "@faridalms/domain/announcements";
import { contentPlainText } from "@faridalms/domain/content";
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
import { Input } from "@faridalms/ui/input";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Archive, CalendarClock, Send } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { announcementEditorQuery } from "~/queries/announcements";

import { ContentEditor } from "~/components/content/ContentEditor";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { CheckboxRow } from "~/components/people/fields";
import {
  DetailsPanel,
  DetailsSection,
  DocumentPage,
  DocumentTitle,
} from "~/components/system/DocumentPage";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { useAutosave } from "~/hooks/useAutosave";
import * as m from "~/i18n/messages";
import { announcementOptionsQuery } from "~/queries/announcements";
import {
  archiveAnnouncement,
  publishAnnouncement,
  saveAnnouncement,
} from "~/server/announcements";
import { getMessageFromError } from "~/utils/error";

import { AudienceList, audienceIssue, audienceSummary } from "./AudienceList";
import { STATE_LABEL, STATE_TONE, URGENCY_LABEL } from "./format";

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
  };
}

const localOf = (iso: string | null | undefined) => {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

/**
 * An announcement written as a document: the title and body take the page,
 * who it reaches and how it behaves sit beside it. Drafts save themselves;
 * sending tells its audience once, and later edits wait for Update, which
 * asks whether to tell them again.
 */
export function AnnouncementEditor({
  existing,
  onClose,
  onCreated,
}: {
  existing: Existing | null;
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}) {
  const options = useSuspenseQuery(announcementOptionsQuery).data;
  const queryClient = useQueryClient();
  const media = useDocumentMedia();
  const id = useRef(existing?.id ?? "");
  const version = useRef(existing?.version ?? 0);
  const [stored, setStored] = useState(existing !== null);
  const [state, setState] = useState(existing?.state ?? "draft");
  const [draft, setDraft] = useState<Draft>(() => draftOf(existing));
  const [sent, setSent] = useState<Draft>(draft);
  const [sendAt, setSendAt] = useState(localOf(existing?.publishAt));
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
  const live = state === "published";

  const persist = useCallback(
    async (value: Draft) => {
      if (!valid) throw new Error("content.invalid");
      const saved = await saveAnnouncement({
        data: {
          id: id.current,
          expectedVersion: version.current,
          title: value.title.trim(),
          body: value.body,
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
      setStored(true);
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      if (created) onCreated(saved.id);
    },
    [valid, queryClient, onCreated],
  );

  // A draft can only be stored once it has a title to list it by.
  const autosave = useAutosave({
    value: draft,
    save: persist,
    enabled: !live && state !== "archived" && draft.title.trim() !== "",
  });

  const change = useCallback((patch: Partial<Draft>) => {
    setIssues([]);
    setDraft((current) => ({ ...current, ...patch }));
  }, []);
  const changeBody = useCallback(
    (body: ContentDocument) => change({ body }),
    [change],
  );

  const problems = () => {
    const found: string[] = [];
    if (!draft.title.trim()) found.push(m.annTitleNeeded());
    if (!contentPlainText(draft.body).trim()) found.push(m.annBodyNeeded());
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
          publishAt: sendAt ? new Date(sendAt).toISOString() : "",
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
      if (notify)
        await publishAnnouncement({
          data: {
            id: id.current,
            expectedVersion: version.current,
            publishAt: "",
            sendUpdate: true,
          },
        });
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
        print={{ title: draft.title, content: draft.body }}
        onBack={async () => {
          if (await autosave.flush()) onClose(id.current || undefined);
        }}
        status={{
          label: STATE_LABEL[state](),
          tone: STATE_TONE[state],
        }}
        saveState={autosave.state}
        onRetry={autosave.retry}
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
                      title: draft.title.trim() || m.annUntitled(),
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
            <DocumentTitle
              id="announcement-title"
              label={m.docTitle()}
              placeholder={m.annUntitled()}
              maxLength={200}
              value={draft.title}
              onChange={(title) => change({ title })}
              onEnter={() =>
                document.getElementById("announcement-body")?.focus()
              }
            />
          </div>
        }
        summary={[
          audienceSummary(draft.audiences, options),
          URGENCY_LABEL[draft.urgency](),
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
        <ContentEditor
          key={editorKey}
          id="announcement-body"
          label={m.annBody()}
          variant="document"
          value={draft.body}
          onChange={changeBody}
          onValidityChange={setValid}
          onUploadingChange={setUploading}
          media={media}
        />
      </DocumentPage>
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
