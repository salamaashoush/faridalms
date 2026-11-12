import { useSuspenseQueries } from "@tanstack/react-query";

import type { IntakePart } from "~/components/admissions/slots";

import { intakeParts } from "~/components/admissions/slots";
import { useSlot } from "~/hooks/useSlot";

/** What the modules on keep about an intake, what each read, and where a new intake starts. */
export interface IntakePartsRead {
  parts: readonly IntakePart[];
  reads: readonly unknown[];
  initial: readonly { value: unknown; startsOn?: string }[];
}

export function useIntakeParts(
  search: Readonly<Record<string, unknown>>,
): IntakePartsRead {
  const parts = useSlot(intakeParts);
  const reads = useSuspenseQueries({
    queries: parts.map((part) => part.query()),
  }).map((read) => read.data);
  return {
    parts,
    reads,
    initial: parts.map((part, index) => part.initial(reads[index], search)),
  };
}
