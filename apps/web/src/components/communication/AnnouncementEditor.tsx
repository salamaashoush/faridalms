import type { ContentDocument } from "@faridalms/domain/content";
import type { AnnouncementAudience } from "@faridalms/domain/notification";

import { contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { ANNOUNCEMENT_AUDIENCES } from "@faridalms/domain/notification";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { getAnnouncement } from "~/server/notifications";

import { ContentEditor } from "~/components/content/ContentEditor";
import {
  DetailsPanel,
  DocumentPage,
  DocumentTitle,
} from "~/components/system/DocumentPage";
import { SelectField } from "~/components/system/field";
import { useAutosave } from "~/hooks/useAutosave";
import * as m from "~/i18n/messages";
import {
  deleteAnnouncement,
  publishAnnouncement,
  saveAnnouncement,
} from "~/server/notifications";
import { getMessageFromError } from "~/utils/error";

import { AUDIENCE_LABEL } from "./announcement-labels";

type Announcement = Awaited<ReturnType<typeof getAnnouncement>>;

interface Draft {
  title: string;
  audience: AnnouncementAudience;
  document: ContentDocument;
}

/**
 * A school-wide notice. Drafts save themselves as they are written; publishing
 * notifies the audience once, and later edits wait for Update because
 * families see them straight away.
 */
export function AnnouncementEditor({
  initial,
  onClose,
  onCreated,
  onPublished,
}: {
  initial: Announcement | null;
  onClose: () => void;
  onCreated: (id: string) => void;
  onPublished: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveAnnouncement);
  const publish = useServerFn(publishAnnouncement);
  const remove = useServerFn(deleteAnnouncement);
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const revision = useRef(initial?.revision ?? 0);
  const [stored, setStored] = useState((initial?.revision ?? 0) > 0);
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [draft, setDraft] = useState<Draft>(() => ({
    title: initial?.title ?? "",
    audience: initial?.audience ?? "everyone",
    document: initial?.document ?? emptyContent(),
  }));
  const [published, setPublished] = useState<Draft>(draft);
  const [editorKey, setEditorKey] = useState(0);
  const [valid, setValid] = useState(true);
  const [pending, setPending] = useState<
    "publish" | "update" | "delete" | null
  >(null);
  const [issues, setIssues] = useState<string[]>([]);
  const live = status === "published";

  const persist = useCallback(
    async (value: Draft) => {
      if (!valid) throw new Error("content.invalid");
      const saved = await save({
        data: { id, expectedRevision: revision.current, ...value },
      });
      const created = revision.current === 0;
      revision.current = saved.revision;
      setStored(true);
      setStatus(saved.status);
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      if (created) onCreated(id);
    },
    [id, valid, save, queryClient, onCreated],
  );

  const autosave = useAutosave({ value: draft, save: persist, enabled: !live });

  const change = useCallback((patch: Partial<Draft>) => {
    setIssues([]);
    setDraft((current) => ({ ...current, ...patch }));
  }, []);
  const changeDocument = useCallback(
    (document: ContentDocument) => change({ document }),
    [change],
  );

  const problems = () => {
    const found: string[] = [];
    if (draft.title.trim().length < 3) found.push(m.announcementIssueTitle());
    if (!contentPlainText(draft.document).trim())
      found.push(m.announcementIssueBody());
    return found;
  };

  const doPublish = async () => {
    const found = problems();
    setIssues(found);
    if (found.length) return;
    setPending("publish");
    try {
      await persist(draft);
      autosave.markSaved(draft);
      const result = await publish({
        data: { id, expectedRevision: revision.current },
      });
      revision.current = result.revision;
      setStatus(result.status);
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(m.announcementPublished());
      onPublished(id);
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setPending(null);
    }
  };

  const doUpdate = async () => {
    const found = problems();
    setIssues(found);
    if (found.length) return;
    setPending("update");
    try {
      await persist(draft);
      setPublished(draft);
      toast.success(m.managementSaved());
    } catch (error) {
      toast.error(getMessageFromError(error));
    } finally {
      setPending(null);
    }
  };

  const doDelete = async () => {
    setPending("delete");
    try {
      if (revision.current > 0)
        await remove({ data: { id, expectedRevision: revision.current } });
      autosave.markSaved(draft);
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      onClose();
    } catch (error) {
      toast.error(getMessageFromError(error));
      setPending(null);
    }
  };

  const unpublishedChanges =
    live && JSON.stringify(draft) !== JSON.stringify(published);

  return (
    <DocumentPage
      heading={initial ? m.announcementEdit() : m.announcementNew()}
      onBack={() => {
        autosave.flush();
        onClose();
      }}
      status={{
        label: live ? m.assignmentStatusPublished() : m.assignmentStatusDraft(),
        tone: live ? "success" : "neutral",
      }}
      saveState={autosave.state}
      onRetry={autosave.retry}
      unpublished={
        unpublishedChanges
          ? {
              pending: pending === "update",
              onDiscard: () => {
                setDraft(published);
                setEditorKey((key) => key + 1);
              },
              onUpdate: () => void doUpdate(),
            }
          : undefined
      }
      primary={
        live
          ? undefined
          : {
              label: m.assignmentPublish(),
              icon: Send,
              pending: pending === "publish",
              onClick: () => void doPublish(),
            }
      }
      preview={
        stored
          ? {
              label: m.docPreview(),
              onClick: () =>
                window.open(`/announcements/${id}`, "_blank", "noopener"),
            }
          : undefined
      }
      menu={
        live
          ? []
          : [
              {
                label: m.assignmentDeleteDraft(),
                icon: Trash2,
                destructive: true,
                onSelect: () => void doDelete(),
                confirm: {
                  title: m.docDeleteConfirmTitle({
                    name: draft.title.trim() || m.announcementUntitled(),
                  }),
                  body: m.docDeleteConfirmBody(),
                  label: m.docDelete(),
                },
              },
            ]
      }
      title={
        <div className="grid gap-3">
          {issues.length ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              <p className="font-medium">{m.announcementIncompleteTitle()}</p>
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
            placeholder={m.announcementUntitled()}
            value={draft.title}
            onChange={(title) => change({ title })}
            onEnter={() =>
              document.getElementById("announcement-body")?.focus()
            }
          />
        </div>
      }
      aside={
        <DetailsPanel title={m.docDetails()}>
          <SelectField
            id="announcement-audience"
            label={m.announcementAudience()}
            hint={m.announcementAudienceHint()}
            value={draft.audience}
            options={ANNOUNCEMENT_AUDIENCES.map((value) => ({
              value,
              label: AUDIENCE_LABEL[value](),
            }))}
            onChange={(audience) => change({ audience })}
          />
        </DetailsPanel>
      }
    >
      <ContentEditor
        key={editorKey}
        id="announcement-body"
        label={m.announcementBody()}
        variant="document"
        value={draft.document}
        onChange={changeDocument}
        onValidityChange={setValid}
      />
    </DocumentPage>
  );
}
