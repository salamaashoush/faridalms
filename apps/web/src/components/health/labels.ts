import type { FamilyHealthKind } from "@faridalms/domain/people";
import type { Tone } from "@faridalms/ui/system/status";

import * as m from "~/i18n/messages";

export type Severity = "mild" | "moderate" | "severe";

export const SEVERITY_LABEL: Record<Severity, () => string> = {
  mild: m.healthSeverityMild,
  moderate: m.healthSeverityModerate,
  severe: m.healthSeveritySevere,
};

export const KIND_SECTION: Record<FamilyHealthKind, () => string> = {
  allergy: m.medicalAllergies,
  chronic_condition: m.medicalConditions,
  medication: m.medicalMedicines,
  dietary_requirement: m.medicalDiet,
  doctor: m.medicalDoctor,
};

export const KIND_ONE: Record<FamilyHealthKind, () => string> = {
  allergy: m.medicalAllergy,
  chronic_condition: m.medicalCondition,
  medication: m.medicalMedicine,
  dietary_requirement: m.medicalDietOne,
  doctor: m.medicalDoctor,
};

export const KIND_EMPTY: Record<FamilyHealthKind, () => string> = {
  allergy: m.medicalNoAllergies,
  chronic_condition: m.medicalNoConditions,
  medication: m.medicalNoMedicines,
  dietary_requirement: m.medicalNoDiet,
  doctor: m.medicalNoDoctor,
};

export const KIND_HINT: Record<FamilyHealthKind, () => string> = {
  allergy: m.medicalAllergyHint,
  chronic_condition: m.medicalConditionHint,
  medication: m.medicalMedicineHint,
  dietary_requirement: m.medicalDietHint,
  doctor: m.medicalDoctorHint,
};

export type ChangeState = "open" | "accepted" | "declined" | "withdrawn";

export const CHANGE_STATE: Record<
  ChangeState,
  { tone: Tone; label: () => string }
> = {
  open: { tone: "warning", label: m.medicalStateOpen },
  accepted: { tone: "success", label: m.medicalStateAccepted },
  declined: { tone: "neutral", label: m.medicalStateDeclined },
  withdrawn: { tone: "neutral", label: m.medicalStateWithdrawn },
};

export function valueLine(
  value: { text: string; severity: Severity | null } | { phone: string | null },
): string {
  if ("phone" in value) return value.phone ?? m.commonNotRecorded();
  return value.severity
    ? `${value.text} · ${SEVERITY_LABEL[value.severity]()}`
    : value.text;
}
