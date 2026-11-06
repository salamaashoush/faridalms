import type {
  PersonNamesInput,
  RelationshipFlags,
} from "@faridalms/domain/people";

import { Checkbox } from "@faridalms/ui/checkbox";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
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
}: {
  script: Script;
  value: NamesDraft[Script];
  onChange: (value: NamesDraft[Script]) => void;
  error?: string | null;
  idPrefix: string;
}) {
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

export function NameFields({
  value,
  onChange,
  error,
  idPrefix,
}: {
  value: NamesDraft;
  onChange: (value: NamesDraft) => void;
  error?: string | null;
  idPrefix: string;
}) {
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

export type FlagsDraft = Omit<RelationshipFlags, "relationId"> & {
  relationId: string;
};

export const PARENT_FLAGS: Omit<FlagsDraft, "relationId"> = {
  legalGuardian: true,
  portalAccess: true,
  receivesNotifications: true,
  primaryContact: false,
  emergencyContact: true,
  residence: "primary",
  pickup: "allowed",
};

export function CheckboxRow({
  label,
  hint,
  error,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
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

export function RelationshipFields({
  value,
  onChange,
  relations,
  relationError,
  portalError,
  idPrefix,
}: {
  value: FlagsDraft;
  onChange: (value: FlagsDraft) => void;
  relations: { value: string; label: string }[];
  relationError?: string | null;
  portalError?: string | null;
  idPrefix: string;
}) {
  const set = <K extends keyof FlagsDraft>(key: K, next: FlagsDraft[K]) =>
    onChange({ ...value, [key]: next });
  return (
    <div className="grid gap-6">
      <SelectField
        id={`${idPrefix}-relation`}
        label={m.guardianRelation()}
        value={value.relationId}
        options={relations}
        onChange={(relationId) => set("relationId", relationId)}
        errors={relationError ? [relationError] : undefined}
        width="name"
      />
      <fieldset className="grid gap-4">
        <legend className="mb-1 text-sm leading-5 font-semibold">
          {m.guardianLinkFlags()}
        </legend>
        <CheckboxRow
          label={m.guardianPortalAccess()}
          hint={m.guardianPortalAccessHint()}
          error={portalError}
          checked={value.portalAccess}
          onChange={(next) => set("portalAccess", next)}
        />
        <CheckboxRow
          label={m.guardianReceivesNotifications()}
          hint={m.guardianReceivesNotificationsHint()}
          checked={value.receivesNotifications}
          onChange={(next) => set("receivesNotifications", next)}
        />
        <CheckboxRow
          label={m.recordPrimaryContact()}
          checked={value.primaryContact}
          onChange={(next) => set("primaryContact", next)}
        />
        <CheckboxRow
          label={m.guardianEmergencyContact()}
          checked={value.emergencyContact}
          onChange={(next) => set("emergencyContact", next)}
        />
        <CheckboxRow
          label={m.guardianLegal()}
          hint={m.guardianLegalHint()}
          checked={value.legalGuardian === true}
          onChange={(next) => set("legalGuardian", next)}
        />
      </fieldset>
      <SelectField
        id={`${idPrefix}-residence`}
        label={m.guardianResidence()}
        hint={m.guardianResidenceHint()}
        value={value.residence ?? "unknown"}
        options={[
          { value: "primary", label: m.guardianResidencePrimary() },
          { value: "secondary", label: m.guardianResidenceSecondary() },
          { value: "none", label: m.guardianResidenceNone() },
          { value: "unknown", label: m.commonNotRecorded() },
        ]}
        onChange={(residence) =>
          set(
            "residence",
            residence === "primary" ||
              residence === "secondary" ||
              residence === "none"
              ? residence
              : null,
          )
        }
        width="name"
      />
      <SelectField
        id={`${idPrefix}-pickup`}
        label={m.guardianPickup()}
        value={value.pickup ?? "unknown"}
        options={[
          { value: "allowed", label: m.guardianPickupAllowed() },
          { value: "ask_office", label: m.guardianPickupAskOffice() },
          { value: "not_allowed", label: m.guardianPickupNotAllowed() },
          { value: "unknown", label: m.commonNotRecorded() },
        ]}
        onChange={(pickup) =>
          set("pickup", pickup === "unknown" ? null : pickup)
        }
        width="name"
      />
    </div>
  );
}
