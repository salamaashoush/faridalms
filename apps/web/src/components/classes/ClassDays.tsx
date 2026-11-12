import type { OpenSpan } from "@faridalms/domain/school";

import { TextField } from "@faridalms/ui/system/form-field";
import { FormSection } from "@faridalms/ui/system/record-form";
import { useSuspenseQueries } from "@tanstack/react-query";

import type {
  ClassEditorPart,
  ClassFormDays,
} from "~/components/classes/slots";

import { classEditorParts } from "~/components/classes/slots";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";

import { lastDay } from "../people/format";

/** The days a class form holds, with what modules keep about the class by their keys. */
export interface ClassDaysValue extends ClassFormDays {
  parts: Record<string, unknown>;
}

/**
 * What the modules on add to a class form, what each read, and the days and
 * parts the form starts from: the class's own, else those a module sets,
 * else from today on.
 */
export function useClassDays(
  record: { id: string; runs: OpenSpan } | null,
  search: Readonly<Record<string, unknown>>,
  today: string,
) {
  const parts = useSlot(classEditorParts);
  const reads = useSuspenseQueries({
    queries: parts.map((part) => part.query(record?.id ?? null)),
  });
  const initial = (): ClassDaysValue => {
    const starts = parts.map((part, index) =>
      part.initial(reads[index]?.data, search),
    );
    const days: ClassFormDays = record
      ? {
          startsOn: record.runs.from,
          endsOn: record.runs.to ? lastDay(record.runs.to) : "",
        }
      : (starts.find((start) => start.days)?.days ?? {
          startsOn: today,
          endsOn: "",
        });
    return {
      ...days,
      parts: Object.fromEntries(
        parts.map((part, index) => [part.key, starts[index]?.value]),
      ),
    };
  };
  return { parts, reads: reads.map((read) => read.data), initial };
}

export interface ClassDaysSectionProps {
  parts: readonly ClassEditorPart[];
  reads: readonly unknown[];
  search: Readonly<Record<string, unknown>>;
  value: ClassDaysValue;
  onChange: (value: ClassDaysValue) => void;
  /** Why the days cannot be saved, shown on the last day. */
  error?: string;
}

/** The days a class runs, and the fields modules add about them. */
export function ClassDaysSection({
  parts,
  reads,
  search,
  value,
  onChange,
  error,
}: ClassDaysSectionProps) {
  return (
    <FormSection title={m.classesDays()} description={m.classesDaysHint()}>
      <ClassPartFields
        section="days"
        parts={parts}
        reads={reads}
        search={search}
        value={value}
        onChange={onChange}
      />
      <TextField
        id="class-starts"
        label={m.classesStartsOn()}
        type="date"
        width="date"
        value={value.startsOn}
        onChange={(event) =>
          onChange({ ...value, startsOn: event.target.value })
        }
      />
      <TextField
        id="class-ends"
        label={m.classesEndsOn()}
        hint={m.classesEndsOnHint()}
        optional
        type="date"
        width="date"
        min={value.startsOn}
        value={value.endsOn}
        onChange={(event) => onChange({ ...value, endsOn: event.target.value })}
        errors={error ? [error] : undefined}
      />
    </FormSection>
  );
}

export interface ClassPartFieldsProps {
  section: ClassEditorPart["section"];
  parts: readonly ClassEditorPart[];
  reads: readonly unknown[];
  search: Readonly<Record<string, unknown>>;
  value: ClassDaysValue;
  onChange: (value: ClassDaysValue) => void;
}

/** The fields the modules on add to one section of a class form. */
export function ClassPartFields({
  section,
  parts,
  reads,
  search,
  value,
  onChange,
}: ClassPartFieldsProps) {
  const days = { startsOn: value.startsOn, endsOn: value.endsOn };
  return parts.map((part, index) =>
    part.section === section ? (
      <part.Field
        key={part.key}
        read={reads[index]}
        search={search}
        value={value.parts[part.key]}
        days={days}
        onChange={(next, set) =>
          onChange({
            ...value,
            ...set,
            parts: { ...value.parts, [part.key]: next },
          })
        }
      />
    ) : null,
  );
}
