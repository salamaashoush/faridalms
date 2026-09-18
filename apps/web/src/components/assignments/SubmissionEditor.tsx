import type { FileSummary } from "@faridalms/database/repositories/files";
import type { ContentDocument } from "@faridalms/domain/content";

import { contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Save, Send } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { getLearnerAssignment } from "~/server/assignments";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/app/dialog";
import { UnsavedChangesGuard } from "~/components/app/UnsavedChangesGuard";
import { ContentEditor } from "~/components/content/ContentEditor";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { saveSubmissionDraft, submitAttempt } from "~/server/assignments";
import { getMessageFromError } from "~/utils/error";

import { FileUploader } from "./FileUploader";

type Learner = Awaited<ReturnType<typeof getLearnerAssignment>>;

/**
 * The learner's draft. Saving keeps it private and revisioned; submitting
 * turns the saved draft into an attempt the teacher can assess.
 */
export function SubmissionEditor({ assignment }: { assignment: Learner }) {
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const save = useServerFn(saveSubmissionDraft);
  const submit = useServerFn(submitAttempt);
  const revision = useRef(assignment.submission.revision);
  const [content, setContent] = useState<ContentDocument>(
    assignment.submission.draft ?? emptyContent(),
  );
  const [contentValid, setContentValid] = useState(true);
  const [files, setFiles] = useState<FileSummary[]>(
    assignment.submission.draftFiles,
  );
  const baseline = useRef(JSON.stringify({ content, files }));
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string>();
  const onContent = useCallback(
    (value: ContentDocument) => setContent(value),
    [],
  );
  const onValidity = useCallback(
    (valid: boolean) => setContentValid(valid),
    [],
  );
  const written = assignment.submissionFormat !== "files";
  const attachments = assignment.submissionFormat !== "written";
  const hasText = written && contentPlainText(content).trim().length > 0;
  const isDirty = () => JSON.stringify({ content, files }) !== baseline.current;
  const persist = async () => {
    const saved = await save({
      data: {
        assignmentId: assignment.id,
        expectedRevision: revision.current,
        content: written ? content : null,
        fileIds: files.map((file) => file.id),
      },
    });
    revision.current = saved.revision;
    baseline.current = JSON.stringify({ content, files });
    return saved;
  };
  const saveMutation = useMutation({
    mutationFn: persist,
    onSuccess: async () => {
      setFailure(undefined);
      toast.success(m.submissionDraftSaved());
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
    },
    onError: (error) => setFailure(getMessageFromError(error)),
  });
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (isDirty() || revision.current === 0) await persist();
      return submit({
        data: {
          assignmentId: assignment.id,
          expectedRevision: revision.current,
        },
      });
    },
    onSuccess: async () => {
      setFailure(undefined);
      setConfirming(false);
      toast.success(m.assignmentsSubmitted());
      baseline.current = JSON.stringify({ content: emptyContent(), files: [] });
      setContent(emptyContent());
      setFiles([]);
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (error) => {
      setConfirming(false);
      setFailure(getMessageFromError(error));
    },
  });
  const pending = saveMutation.isPending || submitMutation.isPending;
  const complete =
    contentValid &&
    (assignment.submissionFormat === "written"
      ? hasText
      : assignment.submissionFormat === "files"
        ? files.length > 0
        : hasText && files.length > 0);
  return (
    <div className="space-y-5">
      <fieldset disabled={!hydrated || pending} className="min-w-0 space-y-5">
        {written ? (
          <ContentEditor
            id="submission-content"
            label={m.courseworkResponse()}
            value={content}
            onChange={onContent}
            onValidityChange={onValidity}
            disabled={pending}
          />
        ) : null}
        {attachments ? (
          <FileUploader
            label={m.attemptFiles()}
            purpose="submission_attachment"
            value={files}
            onChange={setFiles}
            maxFiles={assignment.maxAttachments}
            maxBytes={assignment.maxAttachmentBytes}
            disabled={pending}
          />
        ) : null}
      </fieldset>
      {failure ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {failure}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!hydrated || pending || !contentValid}
          onClick={() => saveMutation.mutate()}
        >
          <Save className="size-4" aria-hidden />
          {m.submissionSaveDraft()}
        </Button>
        <Button
          type="button"
          disabled={!hydrated || pending || !complete}
          onClick={() => setConfirming(true)}
        >
          <Send className="size-4" aria-hidden />
          {assignment.submission.attempts.length
            ? m.submissionResubmit()
            : m.assignmentsSubmit()}
        </Button>
        {assignment.isLateNow ? (
          <span className="text-sm text-[var(--warning-foreground)] dark:text-[var(--warning)]">
            {m.submissionLateWarning()}
          </span>
        ) : null}
      </div>
      <Dialog
        open={confirming}
        onOpenChange={(open) => !pending && setConfirming(open)}
      >
        <DialogContent>
          <DialogTitle>{m.submissionConfirmTitle()}</DialogTitle>
          <DialogDescription>{m.submissionConfirmHint()}</DialogDescription>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              {m.commonCancel()}
            </Button>
            <Button
              type="button"
              onClick={() => submitMutation.mutate()}
              disabled={pending}
            >
              {pending ? m.meSubmitting() : m.assignmentsSubmit()}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <UnsavedChangesGuard isDirty={isDirty} pending={pending} />
    </div>
  );
}
