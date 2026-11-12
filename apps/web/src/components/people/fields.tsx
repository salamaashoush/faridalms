import type { PersonNamesInput } from "@faridalms/domain/people";

import { Checkbox } from "@faridalms/ui/checkbox";
import { TextField } from "@faridalms/ui/system/form-field";
import { CircleAlert } from "lucide-react";
import { useId } from "react";

import * as m from "~/i18n/messages";

export interface NamesDraft {
  ar: { given: string; middle: string; family: string };
  en: { given: string; middle: string; family: string };
}

export const EMPTY_NAMES: NamesDraft = {
  ar: { given: "", middle: "", family: "" },
  en: { given: "", middle: "", family: "" },
};

export function namesFrom(person: {
  givenNameAr: string | null;
  middleNameAr: string | null;
  familyNameAr: string | null;
  givenNameEn: string | null;
  middleNameEn: string | null;
  familyNameEn: string | null;
}): NamesDraft {
  return {
    ar: {
      given: person.givenNameAr ?? "",
      middle: person.middleNameAr ?? "",
      family: person.familyNameAr ?? "",
    },
    en: {
      given: person.givenNameEn ?? "",
      middle: person.middleNameEn ?? "",
      family: person.familyNameEn ?? "",
    },
  };
}

type Script = keyof NamesDraft;

interface ScriptNamesProps {
  script: Script;
  value: NamesDraft[Script];
  onChange: (value: NamesDraft[Script]) => void;
  error?: string | null;
  idPrefix: string;
}

/**
 * A name as its parts in one script. Arabic naming chains put the father's
 * and grandfather's names in the middle, so that part holds a chain.
 */
function ScriptNames({
  script,
  value,
  onChange,
  error,
  idPrefix,
}: ScriptNamesProps) {
  const legendId = useId();
  return (
    <fieldset aria-labelledby={legendId} className="grid min-w-0 gap-4">
      <legend id={legendId} className="text-sm leading-5 font-semibold">
        {script === "ar" ? m.peopleNameArabic() : m.peopleNameEnglish()}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${idPrefix}-${script}-given`}
          label={m.peopleGivenName()}
          autoComplete="off"
          value={value.given}
          onChange={(event) =>
            onChange({ ...value, given: event.target.value })
          }
          errors={error ? [error] : undefined}
        />
        <TextField
          id={`${idPrefix}-${script}-family`}
          label={m.peopleFamilyName()}
          autoComplete="off"
          value={value.family}
          onChange={(event) =>
            onChange({ ...value, family: event.target.value })
          }
        />
      </div>
      <TextField
        id={`${idPrefix}-${script}-middle`}
        label={
          script === "ar" ? m.peopleMiddleNamesArabic() : m.peopleMiddleNames()
        }
        optional
        autoComplete="off"
        value={value.middle}
        onChange={(event) => onChange({ ...value, middle: event.target.value })}
      />
    </fieldset>
  );
}

export interface NameFieldsProps {
  value: NamesDraft;
  onChange: (value: NamesDraft) => void;
  error?: string | null;
  idPrefix: string;
}

export function NameFields({
  value,
  onChange,
  error,
  idPrefix,
}: NameFieldsProps) {
  return (
    <div className="grid gap-6">
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.peopleNamesHint()}
      </p>
      <ScriptNames
        script="ar"
        idPrefix={idPrefix}
        value={value.ar}
        error={error}
        onChange={(ar) => onChange({ ...value, ar })}
      />
      <ScriptNames
        script="en"
        idPrefix={idPrefix}
        value={value.en}
        onChange={(en) => onChange({ ...value, en })}
      />
    </div>
  );
}

function trimmed(value: NamesDraft[Script]) {
  return {
    given: value.given.trim(),
    middle: value.middle.trim(),
    family: value.family.trim(),
  };
}

export function namesInput(draft: NamesDraft): PersonNamesInput {
  return { ar: trimmed(draft.ar), en: trimmed(draft.en) };
}

export function hasName(draft: NamesDraft) {
  return [
    draft.ar.given,
    draft.ar.family,
    draft.en.given,
    draft.en.family,
  ].some((part) => part.trim() !== "");
}

export interface CheckboxRowProps {
  label: string;
  hint?: string;
  error?: string | null;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function CheckboxRow({
  label,
  hint,
  error,
  checked,
  onChange,
  disabled,
}: CheckboxRowProps) {
  const id = useId();
  const described = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div
      data-slot="form-field"
      data-invalid={error ? true : undefined}
      className="flex items-start gap-3"
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onChange(next)}
        className="mt-0.5"
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
      />
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-sm leading-5 font-medium">
          {label}
        </label>
        {error ? (
          <p
            id={`${id}-error`}
            className="flex items-start gap-1.5 text-[13px] leading-[18px] text-destructive"
          >
            <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : hint ? (
          <p
            id={`${id}-hint`}
            className="text-[13px] leading-[18px] text-muted-foreground"
          >
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
