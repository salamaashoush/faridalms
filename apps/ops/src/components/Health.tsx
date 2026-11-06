import type { HealthLevel } from "@faridalms/domain/onboarding";

import { cn } from "@faridalms/ui/cn";

import { HEALTH_LEVEL_NAMES } from "../format";

const TONE: Record<HealthLevel, string> = {
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-destructive",
};

/** A school's health as a dot and its word, so it reads without colour too. */
export function HealthBadge({ level }: { level: HealthLevel }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
      <span aria-hidden className={cn("size-2 rounded-full", TONE[level])} />
      {HEALTH_LEVEL_NAMES[level]}
    </span>
  );
}
