import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { moduleRecordQuery } from "~/queries/learning";

import { classTitle } from "~/components/classes/format";
import { CheckboxRow } from "~/components/people/fields";
import { ComboboxField } from "~/components/system/ComboboxField";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";
import { learningOptionsQuery } from "~/queries/learning";
import { saveModule } from "~/server/learning";
import { getMessageFromError } from "~/utils/error";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof moduleRecordQuery>["queryFn"]>>
>;

interface Draft {
  title: string;
  summary: string;
  classIds: string[];
  prerequisiteId: string;
  sequential: boolean;
}

/** What a module is, which classes take it, and how its lessons open. */
export function ModuleEditor({
  existing,
  classId,
  onClose,
}: {
  existing: Existing | null;
  classId: string;
  onClose: (id?: string) => void;
}) {
  const options = useSuspenseQuery(learningOptionsQuery).data;
  const queryClient = useQueryClient();
  const [initial] = useState<Draft>(() => ({
    title: existing?.title ?? "",
    summary: existing?.summary ?? "",
    classIds:
      existing?.classes.map((row) => row.id) ?? (classId ? [classId] : []),
    prerequisiteId: existing?.prerequisiteId ?? "",
    sequential: existing?.sequential ?? true,
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
        },
      }),
  });
  const issues = {
    title: draft.title.trim() ? null : m.lrnTitleNeeded(),
    classIds: draft.classIds.length > 0 ? null : m.lrnClassesNeeded(),
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
      </FormSection>
    </RecordForm>
  );
}
