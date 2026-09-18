import type { ContentDocument } from "@faridalms/domain/content";
import type { AnnouncementAudience } from "@faridalms/domain/notification";

import { emptyContent } from "@faridalms/domain/content-conversion";
import { ANNOUNCEMENT_AUDIENCES } from "@faridalms/domain/notification";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { getAnnouncement } from "~/server/notifications";

import { ManagementInput } from "~/components/admin/ManagementDialog";
import { ManagementPage } from "~/components/admin/ManagementPage";
import { Field, FieldLabel } from "~/components/app/field";
import { AssignmentStatusBadge } from "~/components/assignments/labels";
import { ContentEditor } from "~/components/content/ContentEditor";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import * as m from "~/i18n/messages";
import {
  deleteAnnouncement,
  publishAnnouncement,
  saveAnnouncement,
} from "~/server/notifications";
import { getMessageFromError } from "~/utils/error";

import { AUDIENCE_LABEL } from "./announcement-labels";

type Announcement = Awaited<ReturnType<typeof getAnnouncement>>;

/** A school-wide notice: title, rich body and audience. Publishing notifies the audience once. */
export function AnnouncementEditor({
  initial,
  onClose,
  onSaved,
  onPublished,
}: {
  initial: Announcement | null;
  onClose: () => void;
  onSaved: (id: string) => void;
  onPublished: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const save = useServerFn(saveAnnouncement);
  const publish = useServerFn(publishAnnouncement);
  const remove = useServerFn(deleteAnnouncement);
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [audience, setAudience] = useState<AnnouncementAudience>(
    initial?.audience ?? "everyone",
  );
  const [document, setDocument] = useState<ContentDocument>(
    initial?.document ?? emptyContent(),
  );
  const [valid, setValid] = useState(true);
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify({ title, audience, document }),
  );
  const leaving = useRef(false);
  const action = useRef<"save" | "publish">("save");
  const mutation = useMutation({
    mutationFn: async () => {
      if (!valid) throw new Error("content.invalid");
      const saved = await save({
        data: { id, expectedRevision: revision, title, audience, document },
      });
      setRevision(saved.revision);
      setStatus(saved.status);
      setBaseline(JSON.stringify({ title, audience, document }));
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      if (action.current === "publish") {
        const published = await publish({
          data: { id, expectedRevision: saved.revision },
        });
        setRevision(published.revision);
        setStatus(published.status);
        await queryClient.invalidateQueries({ queryKey: ["announcements"] });
        await queryClient.invalidateQueries({ queryKey: ["notifications"] });
        toast.success(m.announcementPublished());
        leaving.current = true;
        onPublished(id);
        return;
      }
      toast.success(m.managementSaved());
      onSaved(id);
    },
    onSettled: () => {
      action.current = "save";
    },
  });
  const deletion = useMutation({
    mutationFn: () => remove({ data: { id, expectedRevision: revision } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
      leaving.current = true;
      onClose();
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <ManagementPage
      title={initial ? m.announcementEdit() : m.announcementNew()}
      description={m.announcementHint()}
      pending={mutation.isPending || deletion.isPending}
      onClose={onClose}
      onSubmit={() => mutation.mutateAsync()}
      isDirty={() =>
        !leaving.current &&
        (!valid || JSON.stringify({ title, audience, document }) !== baseline)
      }
      submitLabel={
        status === "published" ? m.managementSave() : m.assignmentSaveDraft()
      }
      headerActions={<AssignmentStatusBadge status={status} />}
      actions={
        <>
          {revision > 0 && status === "draft" ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => deletion.mutate()}
            >
              <Trash2 className="size-4" aria-hidden />
              {m.assignmentDeleteDraft()}
            </Button>
          ) : null}
          {status === "draft" ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                action.current = "publish";
                mutation.mutate();
              }}
            >
              <Send className="size-4" aria-hidden />
              {m.assignmentPublish()}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
        <ManagementInput
          id="announcement-title"
          label={m.newslettersTitle()}
          value={title}
          maxLength={255}
          onChange={(event) => setTitle(event.target.value)}
        />
        <Field>
          <FieldLabel
            id="announcement-audience-label"
            htmlFor="announcement-audience"
          >
            {m.announcementAudience()}
          </FieldLabel>
          <Select
            items={ANNOUNCEMENT_AUDIENCES.map((value) => ({
              value,
              label: AUDIENCE_LABEL[value](),
            }))}
            value={audience}
            onValueChange={(next) => {
              const match = ANNOUNCEMENT_AUDIENCES.find(
                (item) => item === next,
              );
              if (match) setAudience(match);
            }}
          >
            <SelectTrigger
              id="announcement-audience"
              aria-labelledby="announcement-audience-label announcement-audience"
              className="h-11 w-full sm:h-10"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANNOUNCEMENT_AUDIENCES.map((value) => (
                <SelectItem key={value} value={value}>
                  {AUDIENCE_LABEL[value]()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <ContentEditor
        id="announcement-body"
        label={m.announcementBody()}
        value={document}
        onChange={setDocument}
        onValidityChange={setValid}
        disabled={mutation.isPending}
      />
    </ManagementPage>
  );
}
