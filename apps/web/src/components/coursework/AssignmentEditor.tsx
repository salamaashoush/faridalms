import type { ContentDocument } from "@faridalms/domain/content";
import type {
  LatePolicy,
  Rubric,
  SubmissionFormat,
} from "@faridalms/domain/coursework";
import type { FileSummary } from "@faridalms/domain/file";

import { emptyContent } from "@faridalms/domain/content-conversion";
import { rubricTotal } from "@faridalms/domain/coursework";
import { MAX_FILE_BYTES } from "@faridalms/domain/file";
import { zonedInstant, zonedLocal } from "@faridalms/domain/school";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ContentEditor } from "~/components/content/ContentEditor";
import { ComboboxField } from "~/components/system/ComboboxField";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { FileField } from "~/components/system/FileField";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import { Checkbox } from "~/components/ui/checkbox";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import type {
  assignmentEditorQuery} from "~/queries/coursework";
import {
  classGroupsQuery,
  courseworkOptionsQuery,
} from "~/queries/coursework";
import { publishAssignment, saveAssignment } from "~/server/coursework";
import { getMessageFromError } from "~/utils/error";

import { classTitle } from "../classes/format";
import { displayName } from "../people/format";
import { useDocumentMedia } from "./useDocumentMedia";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof assignmentEditorQuery>["queryFn"]>>
>;

interface Draft {
  classId: string;
  title: string;
  brief: ContentDocument;
  resources: FileSummary[];
  audience: "class" | "selected";
  groupIds: string[];
  studentIds: string[];
  availableFrom: string;
  dueAt: string;
  closesAt: string;
  graded: boolean;
  points: string;
  rubricId: string;
  rubric: Rubric | null;
  gradingPeriodId: string;
  submissionFormat: SubmissionFormat;
  maxFiles: string;
  latePolicy: LatePolicy;
  deduction: string;
  resubmission: boolean;
}

type Field =
  | "classId"
  | "title"
  | "dueAt"
  | "closesAt"
  | "points"
  | "audience"
  | "deduction";

const FIELD_ERRORS: Partial<Record<string, Field>> = {
  "coursework.due_before_available": "dueAt",
  "coursework.close_before_due": "closesAt",
  "coursework.deduction_required": "deduction",
  "coursework.rubric_needs_points": "points",
  "coursework.rubric_total": "points",
  "coursework.audience_empty": "audience",
};

function initialDraft(
  existing: Existing | null,
  timeZone: string,
  classId: string,
): Draft {
  const local = (iso: string | null) => (iso ? zonedLocal(iso, timeZone) : "");
  if (!existing)
    return {
      classId,
      title: "",
      brief: emptyContent(),
      resources: [],
      audience: "class",
      groupIds: [],
      studentIds: [],
      availableFrom: "",
      dueAt: "",
      closesAt: "",
      graded: true,
      points: "10",
      rubricId: "",
      rubric: null,
      gradingPeriodId: "",
      submissionFormat: "both",
      maxFiles: "5",
      latePolicy: "accept",
      deduction: "10",
      resubmission: false,
    };
  return {
    classId: existing.classId,
    title: existing.title,
    brief: existing.brief ?? emptyContent(),
    resources: existing.resources,
    audience: existing.audience,
    groupIds: existing.selection.groupIds,
    studentIds: existing.selection.studentIds,
    availableFrom: local(existing.availableFrom),
    dueAt: local(existing.dueAt),
    closesAt: local(existing.closesAt),
    graded: existing.points !== null,
    points: existing.points === null ? "10" : String(existing.points),
    rubricId: "",
    rubric: existing.rubric,
    gradingPeriodId: existing.gradingPeriodId ?? "",
    submissionFormat: existing.submissionFormat,
    maxFiles: String(existing.maxFiles),
    latePolicy: existing.latePolicy,
    deduction: String(existing.lateDeductionPercent ?? 10),
    resubmission: existing.resubmission,
  };
}

function toInstant(local: string, timeZone: string): string {
  if (!local) return "";
  const [date = "", time = "00:00"] = local.split("T");
  return zonedInstant(date, time, timeZone).toISOString();
}

export function AssignmentEditor({
  existing = null,
  classId = "",
  onClose,
}: {
  existing?: Existing | null;
  classId?: string;
  onClose: (id?: string) => void;
}) {
  const options = useSuspenseQuery(courseworkOptionsQuery).data;
  const user = useCurrentUser();
  const timeZone = user.school.timeZone;
  const media = useDocumentMedia();
  const queryClient = useQueryClient();
  const leaving = useRef(false);
  const [initial] = useState(() =>
    initialDraft(
      existing,
      timeZone,
      classId ||
        (
          options.classes.find((row) => row.classType === "scheduled") ??
          options.classes[0]
        )?.id ||
        "",
    ),
  );
  const [draft, setDraft] = useState(initial);
  const [version, setVersion] = useState(existing?.version);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [groupSearch, setGroupSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setErrors((current) => ({ ...current, [key]: undefined }));
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const groups = useQuery({
    ...classGroupsQuery(draft.classId),
    enabled: Boolean(draft.classId),
  }).data;
  const published = existing !== null && existing.state !== "draft";
  const input = () => ({
    ...(existing ? { id: existing.id, expectedVersion: version } : {}),
    classId: draft.classId,
    title: draft.title.trim(),
    brief: draft.brief,
    resourceFileIds: draft.resources.map((file) => file.id),
    audience: draft.audience,
    groupIds: draft.audience === "selected" ? draft.groupIds : [],
    studentIds: draft.audience === "selected" ? draft.studentIds : [],
    availableFrom: toInstant(draft.availableFrom, timeZone),
    dueAt: toInstant(draft.dueAt, timeZone),
    closesAt: toInstant(draft.closesAt, timeZone),
    latePolicy: draft.latePolicy,
    ...(draft.latePolicy === "deduct"
      ? { lateDeductionPercent: Number(draft.deduction) }
      : {}),
    submissionFormat: draft.submissionFormat,
    maxFiles: Number(draft.maxFiles) || 1,
    resubmission: draft.resubmission,
    points: draft.graded ? Number(draft.points) : null,
    rubric: draft.graded ? draft.rubric : null,
    gradingPeriodId: draft.gradingPeriodId,
  });
  const save = useMutation({
    mutationFn: () => saveAssignment({ data: input() }),
    meta: { inlineError: true },
  });
  const publish = useMutation({
    mutationFn: (value: { id: string; version: number }) =>
      publishAssignment({
        data: { id: value.id, expectedVersion: value.version },
      }),
    meta: { inlineError: true },
  });
  const validate = () => {
    const found: typeof errors = {};
    if (!draft.classId) found.classId = m.validationSelection();
    if (!draft.title.trim()) found.title = m.validationRequired();
    if (draft.graded && !(Number(draft.points) > 0))
      found.points = m.courseworkPointsRequired();
    if (draft.latePolicy === "deduct" && !(Number(draft.deduction) >= 1))
      found.deduction = m.courseworkDeductionRequired();
    if (
      draft.audience === "selected" &&
      draft.groupIds.length === 0 &&
      draft.studentIds.length === 0
    )
      found.audience = m.courseworkAudienceRequired();
    return found;
  };
  const failure =
    [save.error, publish.error].find(
      (error) =>
        error && !(error instanceof Error && FIELD_ERRORS[error.message]),
    ) ?? null;
  const fieldError = (field: Field) =>
    errors[field] ? [errors[field]] : undefined;
  const groupOptions = (groups?.groups ?? []).map((row) => ({
    value: row.id,
    label: inLocale(row.titleEn, row.titleAr),
  }));
  const studentOptions = (groups?.roster ?? []).map((row) => ({
    value: row.id,
    label: displayName(row),
  }));
  return (
    <RecordForm
      title={existing ? m.courseworkEditTitle() : m.courseworkNewTitle()}
      submitLabel={published ? m.commonSave() : m.courseworkSaveDraft()}
      secondary={
        published
          ? undefined
          : { label: m.courseworkAssign(), intent: "publish" }
      }
      onSubmit={async (intent) => {
        const found = validate();
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        let saved: { id: string; version: number };
        try {
          saved = await save.mutateAsync();
        } catch (error) {
          const field =
            error instanceof Error ? FIELD_ERRORS[error.message] : undefined;
          if (field) setErrors({ [field]: getMessageFromError(error) });
          return;
        }
        setVersion(saved.version);
        if (intent === "publish") {
          try {
            await publish.mutateAsync(saved);
          } catch (error) {
            const field =
              error instanceof Error ? FIELD_ERRORS[error.message] : undefined;
            if (field) setErrors({ [field]: getMessageFromError(error) });
            return;
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["coursework"] });
        leaving.current = true;
        toast.success(
          intent === "publish" ? m.courseworkAssigned() : m.managementSaved(),
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
      <FormSection title={m.courseworkSectionWork()}>
        <SelectField
          id="work-class"
          label={m.studentClass()}
          value={draft.classId}
          disabled={existing !== null}
          options={options.classes.map((row) => ({
            value: row.id,
            label: classTitle(row),
          }))}
          onChange={(value) => {
            set("classId", value);
            set("groupIds", []);
            set("studentIds", []);
          }}
          errors={fieldError("classId")}
          width="name"
        />
        <TextField
          id="work-title"
          label={m.courseworkTitle()}
          width="name"
          maxLength={200}
          autoComplete="off"
          value={draft.title}
          onChange={(event) => set("title", event.target.value)}
          errors={fieldError("title")}
        />
        <FormField
          id="work-brief"
          label={m.courseworkBrief()}
          hint={m.courseworkBriefHint()}
        >
          {(control) => (
            <div className="min-w-0">
              <ContentEditor
                id={control.id}
                label={m.courseworkBrief()}
                value={draft.brief}
                onChange={(value) => set("brief", value)}
                media={media}
              />
            </div>
          )}
        </FormField>
        <FileField
          id="work-resources"
          label={m.courseworkResources()}
          optional
          purpose="attachment"
          value={draft.resources}
          onChange={(update) =>
            setDraft((current) => ({
              ...current,
              resources: update(current.resources),
            }))
          }
          maxFiles={10}
          maxBytes={MAX_FILE_BYTES}
        />
      </FormSection>
      <FormSection title={m.courseworkSectionWhen()}>
        <SelectField
          id="work-audience"
          label={m.courseworkAudience()}
          value={draft.audience}
          options={[
            { value: "class", label: m.courseworkAudienceClass() },
            { value: "selected", label: m.courseworkAudienceSelected() },
          ]}
          onChange={(value) => set("audience", value)}
          errors={fieldError("audience")}
          width="name"
        />
        {draft.audience === "selected" ? (
          <>
            <ComboboxField
              label={m.courseworkGroups()}
              optional
              multiple
              options={groupOptions.filter((row) =>
                row.label.toLowerCase().includes(groupSearch.toLowerCase()),
              )}
              value={draft.groupIds}
              onChange={(value) => set("groupIds", value)}
              search={groupSearch}
              onSearchChange={setGroupSearch}
            />
            <ComboboxField
              label={m.courseworkStudents()}
              optional
              multiple
              options={studentOptions.filter((row) =>
                row.label.toLowerCase().includes(studentSearch.toLowerCase()),
              )}
              value={draft.studentIds}
              onChange={(value) => set("studentIds", value)}
              search={studentSearch}
              onSearchChange={setStudentSearch}
            />
          </>
        ) : null}
        <TextField
          id="work-due"
          label={m.courseworkDue()}
          hint={m.courseworkDueHint()}
          optional
          type="datetime-local"
          width="name"
          value={draft.dueAt}
          onChange={(event) => set("dueAt", event.target.value)}
          errors={fieldError("dueAt")}
        />
        <TextField
          id="work-available"
          label={m.courseworkAvailableFrom()}
          hint={m.courseworkAvailableHint()}
          optional
          type="datetime-local"
          width="name"
          value={draft.availableFrom}
          onChange={(event) => set("availableFrom", event.target.value)}
        />
        <TextField
          id="work-closes"
          label={m.courseworkClosesAt()}
          hint={m.courseworkClosesHint()}
          optional
          type="datetime-local"
          width="name"
          value={draft.closesAt}
          onChange={(event) => set("closesAt", event.target.value)}
          errors={fieldError("closesAt")}
        />
      </FormSection>
      <FormSection title={m.courseworkSectionGrading()}>
        <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm leading-5 max-md:min-h-10">
          <Checkbox
            checked={draft.graded}
            onCheckedChange={(next) => set("graded", next)}
          />
          {m.courseworkGraded()}
        </label>
        {draft.graded ? (
          <>
            <SelectField
              id="work-rubric"
              label={m.courseworkRubric()}
              optional
              value={draft.rubricId || (draft.rubric ? "current" : "none")}
              options={[
                { value: "none", label: m.courseworkNoRubric() },
                ...(draft.rubric && !draft.rubricId
                  ? [{ value: "current", label: m.courseworkRubricAttached() }]
                  : []),
                ...options.rubrics.map((row) => ({
                  value: row.id,
                  label: row.title,
                })),
              ]}
              onChange={(value) => {
                if (value === "current") return;
                const chosen = options.rubrics.find((row) => row.id === value);
                set("rubricId", chosen ? chosen.id : "");
                set("rubric", chosen ? chosen.rubric : null);
                if (chosen) set("points", String(rubricTotal(chosen.rubric)));
              }}
              width="name"
            />
            <TextField
              id="work-points"
              label={m.courseworkPoints()}
              hint={draft.rubric ? m.courseworkPointsFromRubric() : undefined}
              type="number"
              inputMode="decimal"
              min={0.5}
              step={0.5}
              width="score"
              disabled={draft.rubric !== null}
              value={draft.points}
              onChange={(event) => set("points", event.target.value)}
              errors={fieldError("points")}
            />
            {options.terms.length > 0 ? (
              <SelectField
                id="work-term"
                label={m.courseworkTerm()}
                optional
                value={draft.gradingPeriodId || "none"}
                options={[
                  { value: "none", label: m.commonNotRecorded() },
                  ...options.terms.map((row) => ({
                    value: row.id,
                    label: inLocale(row.titleEn, row.titleAr),
                  })),
                ]}
                onChange={(value) =>
                  set("gradingPeriodId", value === "none" ? "" : value)
                }
                width="name"
              />
            ) : null}
          </>
        ) : null}
      </FormSection>
      <FormSection title={m.courseworkSectionHandIn()}>
        <SelectField
          id="work-format"
          label={m.courseworkFormat()}
          value={draft.submissionFormat}
          options={[
            { value: "both", label: m.courseworkFormatBoth() },
            { value: "online", label: m.courseworkFormatOnline() },
            { value: "files", label: m.courseworkFormatFiles() },
            { value: "none", label: m.courseworkFormatNone() },
          ]}
          onChange={(value) => set("submissionFormat", value)}
          width="name"
        />
        {draft.submissionFormat === "files" ||
        draft.submissionFormat === "both" ? (
          <TextField
            id="work-max-files"
            label={m.courseworkMaxFiles()}
            type="number"
            min={1}
            max={20}
            width="score"
            value={draft.maxFiles}
            onChange={(event) => set("maxFiles", event.target.value)}
          />
        ) : null}
        <SelectField
          id="work-late"
          label={m.courseworkLatePolicy()}
          value={draft.latePolicy}
          options={[
            { value: "accept", label: m.courseworkLateAccept() },
            { value: "deduct", label: m.courseworkLateDeduct() },
            { value: "refuse", label: m.courseworkLateRefuse() },
          ]}
          onChange={(value) => set("latePolicy", value)}
          width="name"
        />
        {draft.latePolicy === "deduct" ? (
          <TextField
            id="work-deduction"
            label={m.courseworkDeduction()}
            type="number"
            min={1}
            max={100}
            width="score"
            value={draft.deduction}
            onChange={(event) => set("deduction", event.target.value)}
            errors={fieldError("deduction")}
          />
        ) : null}
        <label className="flex min-h-9 cursor-pointer items-center gap-3 text-sm leading-5 max-md:min-h-10">
          <Checkbox
            checked={draft.resubmission}
            onCheckedChange={(next) => set("resubmission", next)}
          />
          {m.courseworkResubmission()}
        </label>
      </FormSection>
    </RecordForm>
  );
}
