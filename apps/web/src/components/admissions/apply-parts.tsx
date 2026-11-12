import type { applicationFormSchema } from "@faridalms/domain/admissions";
import type * as v from "valibot";

import { TextField } from "@faridalms/ui/system/form-field";

import type { draftQuery } from "~/queries/admissions";

import * as m from "~/i18n/messages";

export type ApplicationDraft = Awaited<
  ReturnType<NonNullable<ReturnType<typeof draftQuery>["queryFn"]>>
>;

interface Parts {
  given: string;
  middle: string;
  family: string;
}
export interface Names {
  ar: Parts;
  en: Parts;
}
/** The form as the applicant edits it, every name part a string. */
export type ApplicationAnswers = Omit<
  v.InferInput<typeof applicationFormSchema>,
  "other"
> & {
  other:
    | (Omit<
        NonNullable<v.InferInput<typeof applicationFormSchema>["other"]>,
        "names"
      > & { names: Names })
    | null;
};
export const text = (parts: {
  given: string | null;
  middle: string | null;
  family: string | null;
}) => ({
  given: parts.given ?? "",
  middle: parts.middle ?? "",
  family: parts.family ?? "",
});
export const noNames = (): Names => ({
  ar: { given: "", middle: "", family: "" },
  en: { given: "", middle: "", family: "" },
});
export const hasName = (names: Names) =>
  [names.ar, names.en].some(
    (parts) => parts.given.trim() && parts.family.trim(),
  );

export interface NamesFieldsProps {
  id: string;
  names: Names;
  onChange: (names: Names) => void;
  error?: string | null;
}

/** A person's name in Arabic and in English, each with its parts. */
export function NamesFields({ id, names, onChange, error }: NamesFieldsProps) {
  const set = (script: "ar" | "en", part: keyof Names["en"], value: string) =>
    onChange({ ...names, [script]: { ...names[script], [part]: value } });
  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">{m.applyNameAr()}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            id={`${id}-ar-given`}
            label={m.applyGivenAr()}
            dir="rtl"
            value={names.ar.given}
            onChange={(event) => set("ar", "given", event.target.value)}
            errors={error ? [error] : undefined}
          />
          <TextField
            id={`${id}-ar-middle`}
            label={m.applyMiddleAr()}
            optional
            dir="rtl"
            value={names.ar.middle}
            onChange={(event) => set("ar", "middle", event.target.value)}
          />
          <TextField
            id={`${id}-ar-family`}
            label={m.applyFamilyName()}
            dir="rtl"
            value={names.ar.family}
            onChange={(event) => set("ar", "family", event.target.value)}
          />
        </div>
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">{m.applyNameEn()}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            id={`${id}-en-given`}
            label={m.applyGivenEn()}
            dir="ltr"
            value={names.en.given}
            onChange={(event) => set("en", "given", event.target.value)}
          />
          <TextField
            id={`${id}-en-middle`}
            label={m.applyMiddleEn()}
            optional
            dir="ltr"
            value={names.en.middle}
            onChange={(event) => set("en", "middle", event.target.value)}
          />
          <TextField
            id={`${id}-en-family`}
            label={m.applyFamilyName()}
            dir="ltr"
            value={names.en.family}
            onChange={(event) => set("en", "family", event.target.value)}
          />
        </div>
      </fieldset>
    </div>
  );
}
