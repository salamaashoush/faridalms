import type { HealthLevel } from "@faridalms/domain/onboarding";
import type { Tone } from "@faridalms/ui/system/status";

import { StatusBadge } from "@faridalms/ui/system/status";

import { HEALTH_LEVEL_NAMES } from "../format";

export const HEALTH_TONE: Record<HealthLevel, Tone> = {
  green: "success",
  amber: "warning",
  red: "danger",
};

export interface HealthBadgeProps {
  level: HealthLevel;
}

/** A school's health as a status pill, read in words as well as colour. */
export function HealthBadge({ level }: HealthBadgeProps) {
  return (
    <StatusBadge tone={HEALTH_TONE[level]}>
      {HEALTH_LEVEL_NAMES[level]}
    </StatusBadge>
  );
}
