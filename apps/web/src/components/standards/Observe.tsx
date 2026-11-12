import type { MasteryLevel } from "@faridalms/domain/standards";

import { OBSERVED_FRACTION } from "@faridalms/domain/standards";
import { ComboboxField } from "@faridalms/ui/system/combobox-field";
import { ChoiceField, FormField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { observeStandard, searchStandards } from "~/server/standards";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { useWords } from "~/utils/words";

const LEVELS: readonly { value: MasteryLevel; label: () => string }[] = [
  { value: "secure", label: m.skillsSecure },
  { value: "developing", label: m.skillsDeveloping },
  { value: "beginning", label: m.skillsBeginning },
];

const labelOf = (standard: { code: string; statement: string }) =>
  standard.code ? `${standard.code} ${standard.statement}` : standard.statement;

export interface ObserveSheetProps {
  studentId: string;
  /** The class it was seen in, which its Skills tab then counts it for. */
  classId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * A teacher records what they saw a student do against a standard, with no
 * question asked: the standard, the level they judged, and a few words. It
 * counts as one sitting toward the student's mastery.
 */
export function ObserveSheet({
  studentId,
  classId = "",
  open,
  onOpenChange,
}: ObserveSheetProps) {
  const queryClient = useQueryClient();
  const words = useWords();
  const [search, setSearch] = useState("");
  const [standard, setStandard] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [level, setLevel] = useState<MasteryLevel>("developing");
  const [note, setNote] = useState("");
  const [shown, setShown] = useState(false);
  const found = useQuery({
    queryKey: ["standards", "search", search],
    queryFn: () => searchStandards({ data: { query: search } }),
    enabled: open,
    staleTime: 30_000,
  });
  const options = [
    ...(standard ? [{ value: standard.id, label: standard.label }] : []),
    ...(found.data ?? [])
      .filter((row) => row.id !== standard?.id)
      .map((row) => ({ value: row.id, label: labelOf(row) })),
  ];
  const save = useMutation({
    mutationFn: (chosen: string) =>
      observeStandard({
        data: { studentId, classId, standardId: chosen, level, note },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["standards"] });
      toast.success(m.skillsObserved());
      setStandard(null);
      setNote("");
      setShown(false);
      onOpenChange(false);
    },
  });
  const missing = shown && !standard ? [m.skillsObserveStandardNeeded()] : [];
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={m.skillsObserve()}
      submitLabel={m.skillsObserveSave()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={() => {
        setShown(true);
        if (standard) save.mutate(standard.id);
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {words(m.skillsObserveHintCore)()}
      </p>
      <ComboboxField
        label={m.skillsStandard()}
        emptyLabel={m.skillsObserveChoose()}
        options={options}
        value={standard ? [standard.id] : []}
        onChange={([chosen]) => {
          const option = options.find((row) => row.value === chosen);
          setStandard(
            option ? { id: option.value, label: option.label } : null,
          );
        }}
        search={search}
        onSearchChange={setSearch}
        errors={missing}
      />
      <ChoiceField
        label={m.skillsObserveLevel()}
        value={level}
        options={LEVELS.map((row) => ({
          value: row.value,
          label: row.label(),
          hint: m.skillsObservedCounts({
            value: formatNumber(OBSERVED_FRACTION[row.value] * 100),
          }),
        }))}
        onChange={setLevel}
      />
      <FormField id="observe-note" label={m.skillsObserveNote()} optional>
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={500}
            placeholder={m.skillsObserveNotePlaceholder()}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}
