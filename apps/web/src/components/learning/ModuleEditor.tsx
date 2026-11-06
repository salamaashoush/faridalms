import type { FeedbackBand } from "@faridalms/domain/learning";

import { ComboboxField } from "@faridalms/ui/system/combobox-field";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { FormSection, RecordForm } from "@faridalms/ui/system/record-form";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { moduleRecordQuery } from "~/queries/learning";

import { classTitle } from "~/components/classes/format";
import { CheckboxRow } from "~/components/people/fields";
import { displayName } from "~/components/people/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classGroupsQuery } from "~/queries/coursework";
import { learningOptionsQuery } from "~/queries/learning";
import { saveModule } from "~/server/learning";
import { getMessageFromError } from "~/utils/error";

import { FeedbackBands, keptBands } from "./FeedbackBands";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof moduleRecordQuery>["queryFn"]>>
>;

interface Chosen {
  groupIds: string[];
  studentIds: string[];
}

interface Draft {
  title: string;
  summary: string;
  classIds: string[];
  prerequisiteId: string;
  prerequisiteScore: string;
  sequential: boolean;
  /** The classes taken only by chosen groups and students, by class. */
  audiences: Record<string, Chosen>;
  practiceBands: FeedbackBand[];
}

interface ClassAudienceProps {
  classId: string;
  title: string;
  value: Chosen | undefined;
  onChange: (value: Chosen | undefined) => void;
  missing: boolean;
}

/** Who in one class takes the module: everyone, or the groups and students chosen. */
function ClassAudience({
  classId,
  title,
  value,
  onChange,
  missing,
}: ClassAudienceProps) {
  const groups = useQuery({
    ...classGroupsQuery(classId),
    enabled: value !== undefined,
  }).data;
  const [groupSearch, setGroupSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const groupOptions = (groups?.groups ?? []).map((row) => ({
    value: row.id,
    label: inLocale(row.titleEn, row.titleAr),
  }));
  const studentOptions = (groups?.roster ?? []).map((row) => ({
    value: row.id,
    label: displayName(row),
  }));
  return (
    <div className="grid gap-3">
      <SelectField
        id={`module-audience-${classId}`}
        label={m.lrnAudienceIn({ class: title })}
        width="name"
        value={value ? "selected" : "class"}
        options={[
          { value: "class", label: m.lrnAudienceClass() },
          { value: "selected", label: m.lrnAudienceSelected() },
        ]}
        onChange={(next) =>
          onChange(
            next === "selected"
              ? (value ?? { groupIds: [], studentIds: [] })
              : undefined,
          )
        }
        errors={missing ? [m.lrnAudienceNeeded()] : undefined}
      />
      {value ? (
        <>
          <ComboboxField
            label={m.courseworkGroups()}
            optional
            multiple
            options={groupOptions.filter((row) =>
              row.label.toLowerCase().includes(groupSearch.toLowerCase()),
            )}
            value={value.groupIds}
            onChange={(groupIds) => onChange({ ...value, groupIds })}
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
            value={value.studentIds}
            onChange={(studentIds) => onChange({ ...value, studentIds })}
            search={studentSearch}
            onSearchChange={setStudentSearch}
          />
        </>
      ) : null}
    </div>
  );
}

export interface ModuleEditorProps {
  existing: Existing | null;
  classId: string;
  onClose: (id?: string) => void;
}

/** What a module is, which classes take it, and how its lessons open. */
export function ModuleEditor({
  existing,
  classId,
  onClose,
}: ModuleEditorProps) {
  const options = useSuspenseQuery(learningOptionsQuery).data;
  const queryClient = useQueryClient();
  const [initial] = useState<Draft>(() => ({
    title: existing?.title ?? "",
    summary: existing?.summary ?? "",
    classIds:
      existing?.classes.map((row) => row.id) ?? (classId ? [classId] : []),
    prerequisiteId: existing?.prerequisiteId ?? "",
    prerequisiteScore: existing?.prerequisiteScore
      ? String(existing.prerequisiteScore)
      : "",
    sequential: existing?.sequential ?? true,
    practiceBands: existing?.practiceBands ?? [],
    audiences: Object.fromEntries(
      (existing?.audiences ?? []).map((row) => [
        row.classId,
        { groupIds: row.groupIds, studentIds: row.studentIds },
      ]),
    ),
  }));
  const [draft, setDraft] = useState(initial);
  const [classSearch, setClassSearch] = useState("");
  const [shown, setShown] = useState(false);
  const leaving = useRef(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = useMutation({
    mutationFn: () =>
      saveModule({
        data: {
          id: existing?.id ?? "",
          expectedVersion: existing?.version ?? 0,
          ...draft,
          title: draft.title.trim(),
          summary: draft.summary.trim(),
          prerequisiteScore:
            draft.prerequisiteId && draft.prerequisiteScore.trim()
              ? Number(draft.prerequisiteScore)
              : null,
          practiceBands: keptBands(draft.practiceBands),
          audiences: draft.classIds.flatMap((id) => {
            const chosen = draft.audiences[id];
            return chosen ? [{ classId: id, ...chosen }] : [];
          }),
        },
      }),
  });
  const unchosen = draft.classIds.filter((id) => {
    const chosen = draft.audiences[id];
    return (
      chosen !== undefined &&
      chosen.groupIds.length === 0 &&
      chosen.studentIds.length === 0
    );
  });
  const needed = Number(draft.prerequisiteScore);
  const issues = {
    title: draft.title.trim() ? null : m.lrnTitleNeeded(),
    prerequisiteScore:
      !draft.prerequisiteId ||
      !draft.prerequisiteScore.trim() ||
      (Number.isInteger(needed) && needed >= 1 && needed <= 100)
        ? null
        : m.lrnPrerequisiteScoreInvalid(),
    classIds: draft.classIds.length > 0 ? null : m.lrnClassesNeeded(),
    audiences: unchosen.length > 0 ? m.lrnAudienceNeeded() : null,
  };
  const classOptions = options.classes.map((row) => ({
    value: row.id,
    label: classTitle(row),
  }));
  return (
    <RecordForm
      title={existing ? m.lrnEditModule() : m.lrnNewModule()}
      onSubmit={async () => {
        setShown(true);
        if (Object.values(issues).some(Boolean)) return;
        let saved: { id: string };
        try {
          saved = await save.mutateAsync();
        } catch {
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["learning"] });
        leaving.current = true;
        toast.success(m.lrnModuleSaved());
        onClose(saved.id);
      }}
      onCancel={() => onClose()}
      isDirty={() =>
        !leaving.current && JSON.stringify(draft) !== JSON.stringify(initial)
      }
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
    >
      <FormSection title={m.lrnSectionModule()}>
        <TextField
          id="module-title"
          label={m.lrnModuleTitle()}
          width="name"
          dir="auto"
          maxLength={200}
          autoComplete="off"
          value={draft.title}
          onChange={(event) => set("title", event.target.value)}
          errors={shown && issues.title ? [issues.title] : undefined}
        />
        <FormField id="module-summary" label={m.lrnSummary()} optional>
          {(control) => (
            <Textarea
              {...control}
              dir="auto"
              maxLength={1000}
              rows={3}
              value={draft.summary}
              onChange={(event) => set("summary", event.target.value)}
            />
          )}
        </FormField>
        <ComboboxField
          label={m.lrnClasses()}
          emptyLabel={m.lrnChooseClasses()}
          multiple
          options={classOptions.filter((row) =>
            row.label.toLowerCase().includes(classSearch.toLowerCase()),
          )}
          value={draft.classIds}
          onChange={(value) => set("classIds", value)}
          search={classSearch}
          onSearchChange={setClassSearch}
          errors={shown && issues.classIds ? [issues.classIds] : undefined}
        />
      </FormSection>
      {draft.classIds.length > 0 ? (
        <FormSection
          title={m.lrnSectionAudience()}
          description={m.lrnSectionAudienceHint()}
        >
          {draft.classIds.map((id) => (
            <ClassAudience
              key={id}
              classId={id}
              title={classOptions.find((row) => row.value === id)?.label ?? ""}
              value={draft.audiences[id]}
              onChange={(value) =>
                setDraft((current) => {
                  const audiences = { ...current.audiences };
                  if (value) audiences[id] = value;
                  else delete audiences[id];
                  return { ...current, audiences };
                })
              }
              missing={shown && unchosen.includes(id)}
            />
          ))}
        </FormSection>
      ) : null}
      <FormSection title={m.lrnSectionOrder()}>
        <CheckboxRow
          label={m.lrnSequential()}
          hint={m.lrnSequentialHint()}
          checked={draft.sequential}
          onChange={(sequential) => set("sequential", sequential)}
        />
        <SelectField
          id="module-prerequisite"
          label={m.lrnPrerequisite()}
          hint={m.lrnPrerequisiteHint()}
          width="name"
          value={draft.prerequisiteId}
          options={[
            { value: "", label: m.lrnNoPrerequisite() },
            ...options.modules
              .filter((row) => row.id !== existing?.id)
              .map((row) => ({ value: row.id, label: row.title })),
          ]}
          onChange={(prerequisiteId) => set("prerequisiteId", prerequisiteId)}
        />
        {draft.prerequisiteId ? (
          <TextField
            id="module-prerequisite-score"
            label={m.lrnPrerequisiteScore()}
            hint={m.lrnPrerequisiteScoreHint()}
            optional
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            width="score"
            value={draft.prerequisiteScore}
            onChange={(event) => set("prerequisiteScore", event.target.value)}
            errors={
              shown && issues.prerequisiteScore
                ? [issues.prerequisiteScore]
                : undefined
            }
          />
        ) : null}
      </FormSection>
      <FormSection title={m.lrnSectionPractice()}>
        <FeedbackBands
          bands={draft.practiceBands}
          onChange={(bands) => set("practiceBands", bands)}
          hint={m.lrnPracticeBandsHint()}
        />
      </FormSection>
    </RecordForm>
  );
}
