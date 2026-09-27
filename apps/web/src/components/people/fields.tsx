import type {
  PersonNamesInput,
  RelationshipFlags,
} from "@faridalms/domain/people";

import { useId } from "react";

import { SelectField, TextField } from "~/components/system/field";
import { Checkbox } from "~/components/ui/checkbox";
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
  livesWith: true,
  pickup: "allowed",
};

function CheckboxRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next)}
        className="mt-0.5"
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-sm leading-5 font-medium">
          {label}
        </label>
        {hint ? (
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
  idPrefix,
}: {
  value: FlagsDraft;
  onChange: (value: FlagsDraft) => void;
  relations: { value: string; label: string }[];
  relationError?: string | null;
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
          checked={value.portalAccess}
          onChange={(next) => set("portalAccess", next)}
        />
        <CheckboxRow
          label={m.guardianReceivesNotifications()}
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
        <CheckboxRow
          label={m.guardianLivesWith()}
          checked={value.livesWith === true}
          onChange={(next) => set("livesWith", next)}
        />
      </fieldset>
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
