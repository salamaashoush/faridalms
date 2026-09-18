import type { FileSummary } from "@faridalms/database/repositories/files";
import type {
  AssignmentRecipientsInput,
  RubricCriterion,
  SaveAssignmentInput,
} from "@faridalms/domain/assignment";
import type { ContentDocument } from "@faridalms/domain/content";

import {
  ASSIGNMENT_TYPES,
  LATE_POLICIES,
  MAX_ATTACHMENTS,
  RESUBMISSION_POLICIES,
  SUBMISSION_FORMATS,
  saveAssignmentSchema,
} from "@faridalms/domain/assignment";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { MAX_FILE_BYTES } from "@faridalms/domain/file";
import { zonedInstant, zonedLocal } from "@faridalms/domain/school";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, Eye, Send, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type {
  getAuthoringAssignment,
  getAuthoringContext,
} from "~/server/assignments";

import { ManagementInput } from "~/components/admin/ManagementDialog";
import { ManagementPage } from "~/components/admin/ManagementPage";
import { SelectField } from "~/components/admin/SelectField";
import { ButtonLink } from "~/components/app/ButtonLink";
import { ASSIGNMENT_TYPE_LABEL } from "~/components/app/labels";
import { ContentEditor } from "~/components/content/ContentEditor";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import {
  archiveAssignment,
  deleteDraftAssignment,
  publishAssignment,
  saveAssignment,
} from "~/server/assignments";
import { getMessageFromError } from "~/utils/error";

import { FileUploader } from "./FileUploader";
import {
  AssignmentStatusBadge,
  LATE_POLICY_LABEL,
  RESUBMISSION_LABEL,
  SUBMISSION_FORMAT_LABEL,
} from "./labels";
import { RecipientSelector } from "./RecipientSelector";
import { RubricEditor } from "./RubricEditor";

type AuthoringContext = Awaited<ReturnType<typeof getAuthoringContext>>;
type AuthoringAssignment = Awaited<ReturnType<typeof getAuthoringAssignment>>;

const ISSUE_LABEL: Record<string, () => string> = {
  title: m.assignmentIssueTitle,
  instructions: m.assignmentIssueInstructions,
  recipients: m.assignmentIssueRecipients,
  rubric_titles: m.assignmentIssueRubricTitles,
};

/**
 * The full-page designer. Everything a teacher decides about a piece of work
 * lives here; the record page is where it is read and worked on.
 */
export function AssignmentDesigner({
  initial,
  context,
  classId,
  onClassChange,
  onClose,
  onSaved,
  onPublished,
}: {
  initial: AuthoringAssignment | null;
  context: AuthoringContext;
  classId: string;
  onClassChange: (classId: string) => void;
  onClose: () => void;
  onSaved: (id: string) => void;
  onPublished: (id: string) => void;
}) {
  const timeZone = context.timeZone;
  const local = (value: string | Date | null | undefined) =>
    value ? zonedLocal(value, timeZone) : "";
  const queryClient = useQueryClient();
  const save = useServerFn(saveAssignment);
  const publish = useServerFn(publishAssignment);
  const archive = useServerFn(archiveAssignment);
  const remove = useServerFn(deleteDraftAssignment);
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [status, setStatus] = useState(initial?.status ?? "draft");
  const [instructions, setInstructions] = useState<ContentDocument>(
    initial?.instructions ?? emptyContent(),
  );
  const [instructionsValid, setInstructionsValid] = useState(true);
  const [resources, setResources] = useState<FileSummary[]>(
    initial?.resources ?? [],
  );
  const [recipients, setRecipients] = useState<AssignmentRecipientsInput>({
    mode: initial?.recipientMode ?? "class",
    groupIds:
      initial?.recipientMode === "groups"
        ? context.groups
            .filter((group) =>
              group.studentIds.some((studentId) =>
                initial.recipientStudentIds.includes(studentId),
              ),
            )
            .map((group) => group.id)
        : [],
    studentIds:
      initial?.recipientMode === "students" ? initial.recipientStudentIds : [],
  });
  const [rubric, setRubric] = useState<RubricCriterion[]>(
    initial?.rubric ?? [],
  );
  const [rubricErrors, setRubricErrors] = useState<Array<{ message?: string }>>(
    [],
  );
  const action = useRef<"save" | "publish">("save");
  const leaving = useRef(false);
  const [defaults, setDefaults] = useState(() => ({
    subjectId:
      initial?.subjectId ??
      context.classes.find((row) => row.id === classId)?.authoringSubjects[0]
        ?.id ??
      "",
    type: initial?.type ?? ("written_assignment" as const),
    title: initial?.title ?? "",
    availableFrom: local(initial?.availableFrom),
    dueAt: local(initial?.dueAt),
    closesAt: local(initial?.closesAt),
    latePolicy: initial?.latePolicy ?? ("not_accepted" as const),
    lateDeductionPercent: initial?.lateDeductionPercent ?? 0,
    submissionFormat: initial?.submissionFormat ?? ("written" as const),
    maxAttachments: initial?.maxAttachments ?? 3,
    maxAttachmentMb: Math.max(
      1,
      Math.round(
        (initial?.maxAttachmentBytes ?? 10 * 1024 * 1024) / (1024 * 1024),
      ),
    ),
    resubmission: initial?.resubmission ?? ("not_allowed" as const),
    maxScore: initial?.maxScore ?? 10,
  }));
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify({ defaults, instructions, resources, recipients, rubric }),
  );
  const toInput = (value: typeof defaults): SaveAssignmentInput => {
    const instant = (item: string) =>
      item.length >= 16
        ? zonedInstant(
            item.slice(0, 10),
            item.slice(11, 16),
            timeZone,
          ).toISOString()
        : "";
    return {
      id,
      expectedRevision: revision,
      classId,
      subjectId: value.subjectId,
      type: value.type,
      title: value.title,
      instructions,
      resourceFileIds: resources.map((file) => file.id),
      recipients,
      availableFrom: instant(value.availableFrom),
      dueAt: instant(value.dueAt),
      closesAt: instant(value.closesAt),
      latePolicy: value.latePolicy,
      lateDeductionPercent: value.lateDeductionPercent,
      submissionFormat: value.submissionFormat,
      maxAttachments: value.maxAttachments,
      maxAttachmentBytes: value.maxAttachmentMb * 1024 * 1024,
      resubmission: value.resubmission,
      maxScore: value.maxScore,
      rubric,
    };
  };
  const mutation = useMutation({ mutationFn: save });
  const form = useForm({
    defaultValues: defaults,
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(saveAssignmentSchema, toInput(value));
        setRubricErrors([]);
        if (result.success) return undefined;
        const fields: Record<string, v.BaseIssue<unknown>> = {};
        for (const issue of result.issues) {
          const key = issue.path?.[0]?.key;
          if (typeof key !== "string") continue;
          if (key === "rubric") setRubricErrors([issue]);
          else if (key === "maxAttachmentBytes") fields.maxAttachmentMb = issue;
          else fields[key] = issue;
        }
        return { fields };
      },
    },
    onSubmit: async ({ value }) => {
      if (!instructionsValid) throw new Error("content.invalid");
      const input = v.parse(saveAssignmentSchema, toInput(value));
      const saved = await mutation.mutateAsync({ data: input });
      setRevision(saved.revision);
      setStatus(saved.status);
      setDefaults(value);
      setBaseline(
        JSON.stringify({
          defaults: value,
          instructions,
          resources,
          recipients,
          rubric,
        }),
      );
      form.reset(value);
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
      if (action.current === "publish") {
        try {
          const published = await publish({
            data: { id, expectedRevision: saved.revision },
          });
          setRevision(published.revision);
          setStatus(published.status);
          await queryClient.invalidateQueries({ queryKey: ["assignments"] });
          toast.success(m.courseworkPublished());
          leaving.current = true;
          onPublished(id);
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message.startsWith("assignment.incomplete:")) {
            const issues = message
              .slice("assignment.incomplete:".length)
              .split(",")
              .map((issue) => ISSUE_LABEL[issue]?.() ?? issue);
            throw new Error(
              `${m.assignmentIncomplete()} ${issues.join(", ")}`,
              {
                cause: error,
              },
            );
          }
          throw error;
        } finally {
          action.current = "save";
        }
      }
      toast.success(
        status === "published" ? m.managementSaved() : m.assignmentDraftSaved(),
      );
      onSaved(id);
    },
  });
  const isDirty = () =>
    !leaving.current &&
    (!instructionsValid ||
      JSON.stringify({
        defaults: form.state.values,
        instructions,
        resources,
        recipients,
        rubric,
      }) !== baseline);
  const onInstructions = useCallback(
    (value: ContentDocument) => setInstructions(value),
    [],
  );
  const onInstructionsValidity = useCallback(
    (valid: boolean) => setInstructionsValid(valid),
    [],
  );
  const archiveMutation = useMutation({
    mutationFn: () => archive({ data: { id, expectedRevision: revision } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
      setRevision(result.revision);
      setStatus(result.status);
      toast.success(m.assignmentArchived());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: () => remove({ data: { id, expectedRevision: revision } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
      toast.success(m.assignmentDeleted());
      leaving.current = true;
      onClose();
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const lifecyclePending =
    archiveMutation.isPending || deleteMutation.isPending;
  const selectedClass = context.classes.find((row) => row.id === classId);
  const saved = revision > 0;
  return (
    <ManagementPage
      title={initial ? m.assignmentEditTitle() : m.assignmentDesignTitle()}
      description={m.assignmentDesignHint()}
      pending={mutation.isPending || lifecyclePending}
      onClose={onClose}
      onSubmit={() => form.handleSubmit()}
      isDirty={isDirty}
      sectioned
      submitLabel={
        status === "published" ? m.managementSave() : m.assignmentSaveDraft()
      }
      headerActions={
        <>
          <AssignmentStatusBadge status={status} />
          {saved ? (
            <ButtonLink
              variant="outline"
              to="/assignments/$assignmentId"
              params={{ assignmentId: id }}
              search={{}}
            >
              <Eye className="size-4" aria-hidden />
              {m.assignmentOpenRecord()}
            </ButtonLink>
          ) : null}
        </>
      }
      actions={
        <>
          {saved && status === "draft" ? (
            <Button
              type="button"
              variant="ghost"
              disabled={lifecyclePending}
              onClick={() => deleteMutation.mutate()}
            >
              <Trash2 className="size-4" aria-hidden />
              {m.assignmentDeleteDraft()}
            </Button>
          ) : null}
          {status === "published" ? (
            <Button
              type="button"
              variant="ghost"
              disabled={lifecyclePending}
              onClick={() => archiveMutation.mutate()}
            >
              <Archive className="size-4" aria-hidden />
              {m.assignmentArchive()}
            </Button>
          ) : null}
          {status === "draft" ? (
            <Button
              type="button"
              variant="secondary"
              disabled={mutation.isPending}
              onClick={() => {
                action.current = "publish";
                void form.handleSubmit();
              }}
            >
              <Send className="size-4" aria-hidden />
              {m.assignmentPublish()}
            </Button>
          ) : null}
        </>
      }
    >
      <section className="grid gap-5 rounded-xl border bg-card p-5 sm:p-7">
        <h2 className="text-sm font-semibold">{m.assignmentBrief()}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="assignment-class"
            label={m.studentClass()}
            value={classId}
            disabled={Boolean(initial)}
            options={context.classes.map((row) => ({
              value: row.id,
              label: row.name,
            }))}
            onChange={onClassChange}
          />
          <form.Field name="subjectId">
            {(field) => (
              <SelectField
                id="assignment-subject"
                label={m.assignmentsSubject()}
                value={field.state.value}
                options={(selectedClass?.authoringSubjects ?? []).map(
                  (subject) => ({
                    value: subject.id,
                    label: subject.name,
                  }),
                )}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name="title">
            {(field) => (
              <ManagementInput
                id="assignment-title"
                label={m.courseworkTitle()}
                value={field.state.value}
                maxLength={255}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="type">
            {(field) => (
              <SelectField
                id="assignment-type"
                label={m.assignmentsType()}
                value={field.state.value}
                options={ASSIGNMENT_TYPES.map((type) => ({
                  value: type,
                  label: ASSIGNMENT_TYPE_LABEL[type](),
                }))}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        </div>
        <ContentEditor
          id="assignment-instructions"
          label={m.courseworkInstructions()}
          value={instructions}
          onChange={onInstructions}
          onValidityChange={onInstructionsValidity}
          disabled={mutation.isPending}
        />
        <FileUploader
          label={m.assignmentResources()}
          description={m.assignmentResourcesHint()}
          purpose="assignment_resource"
          value={resources}
          onChange={setResources}
          maxFiles={MAX_ATTACHMENTS}
          maxBytes={MAX_FILE_BYTES}
          disabled={mutation.isPending}
        />
      </section>
      <section className="grid gap-5 rounded-xl border bg-card p-5 sm:p-7">
        <RecipientSelector
          classId={classId}
          roster={context.roster}
          groups={context.groups}
          value={recipients}
          onChange={setRecipients}
          disabled={mutation.isPending}
        />
      </section>
      <section className="grid gap-5 rounded-xl border bg-card p-5 sm:p-7">
        <div>
          <h2 className="text-sm font-semibold">{m.assignmentSchedule()}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {m.assignmentScheduleHint({ zone: timeZone })}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <form.Field name="availableFrom">
            {(field) => (
              <ManagementInput
                id="assignment-available"
                type="datetime-local"
                label={m.assignmentAvailableFrom()}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="dueAt">
            {(field) => (
              <ManagementInput
                id="assignment-due"
                type="datetime-local"
                label={m.assignmentDueAt()}
                required
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="closesAt">
            {(field) => (
              <ManagementInput
                id="assignment-closes"
                type="datetime-local"
                label={m.assignmentClosesAt()}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
          <form.Field name="latePolicy">
            {(field) => (
              <SelectField
                id="assignment-late"
                label={m.assignmentLatePolicy()}
                value={field.state.value}
                options={LATE_POLICIES.map((policy) => ({
                  value: policy,
                  label: LATE_POLICY_LABEL[policy](),
                }))}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.latePolicy}>
            {(latePolicy) =>
              latePolicy === "accepted_with_deduction" ? (
                <form.Field name="lateDeductionPercent">
                  {(field) => (
                    <ManagementInput
                      id="assignment-deduction"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100}
                      label={m.assignmentLateDeduction()}
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(
                          Math.trunc(event.target.valueAsNumber || 0),
                        )
                      }
                      errors={field.state.meta.errors}
                    />
                  )}
                </form.Field>
              ) : null
            }
          </form.Subscribe>
          <form.Field name="resubmission">
            {(field) => (
              <SelectField
                id="assignment-resubmission"
                label={m.assignmentResubmission()}
                value={field.state.value}
                options={RESUBMISSION_POLICIES.map((policy) => ({
                  value: policy,
                  label: RESUBMISSION_LABEL[policy](),
                }))}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        </div>
      </section>
      <section className="grid gap-5 rounded-xl border bg-card p-5 sm:p-7">
        <h2 className="text-sm font-semibold">
          {m.assignmentSubmissionFormat()}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <form.Field name="submissionFormat">
            {(field) => (
              <SelectField
                id="assignment-format"
                label={m.assignmentSubmissionFormat()}
                value={field.state.value}
                options={SUBMISSION_FORMATS.map((format) => ({
                  value: format,
                  label: SUBMISSION_FORMAT_LABEL[format](),
                }))}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.submissionFormat}>
            {(format) =>
              format === "written" ? null : (
                <>
                  <form.Field name="maxAttachments">
                    {(field) => (
                      <ManagementInput
                        id="assignment-attachments"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_ATTACHMENTS}
                        label={m.assignmentMaxAttachments()}
                        value={field.state.value}
                        onChange={(event) =>
                          field.handleChange(
                            Math.trunc(event.target.valueAsNumber || 0),
                          )
                        }
                        errors={field.state.meta.errors}
                      />
                    )}
                  </form.Field>
                  <form.Field name="maxAttachmentMb">
                    {(field) => (
                      <SelectField
                        id="assignment-attachment-size"
                        label={m.assignmentMaxAttachmentSize()}
                        value={String(field.state.value)}
                        options={[1, 5, 10, 25].map((size) => ({
                          value: String(size),
                          label: m.fileSizeMegabytes({ count: String(size) }),
                        }))}
                        onChange={(value) => field.handleChange(Number(value))}
                      />
                    )}
                  </form.Field>
                </>
              )
            }
          </form.Subscribe>
        </div>
      </section>
      <section className="grid gap-5 rounded-xl border bg-card p-5 sm:p-7">
        <h2 className="text-sm font-semibold">{m.assignmentGrading()}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <form.Field name="maxScore">
            {(field) => (
              <ManagementInput
                id="assignment-max"
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                label={m.courseworkMaxScore()}
                value={field.state.value}
                onChange={(event) =>
                  field.handleChange(
                    Math.trunc(event.target.valueAsNumber || 0),
                  )
                }
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
        </div>
        <form.Subscribe selector={(state) => state.values.maxScore}>
          {(maxScore) => (
            <RubricEditor
              value={rubric}
              onChange={setRubric}
              maxScore={maxScore}
              disabled={mutation.isPending}
              errors={rubricErrors}
            />
          )}
        </form.Subscribe>
      </section>
    </ManagementPage>
  );
}
