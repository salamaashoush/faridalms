import type { RelationshipFlags } from "@faridalms/domain/families";

import { SelectField } from "@faridalms/ui/system/form-field";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

import { CheckboxRow } from "../people/fields";

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

export interface RelationshipFieldsProps {
  value: FlagsDraft;
  onChange: (value: FlagsDraft) => void;
  relations: { value: string; label: string }[];
  relationError?: string | null;
  portalError?: string | null;
  idPrefix: string;
}

export function RelationshipFields({
  value,
  onChange,
  relations,
  relationError,
  portalError,
  idPrefix,
}: RelationshipFieldsProps) {
  const { texts } = useCurrentUser();
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
          hint={
            texts
              ? m.guardianReceivesNotificationsHint()
              : m.guardianReceivesNotificationsHintEmail()
          }
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
