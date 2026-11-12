import type { LinkProps } from "@tanstack/react-router";

import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

/** Something the office should see to on Today. */
export interface OfficeNeed {
  key: string;
  label: string;
  link: LinkProps;
}

/**
 * What a module reads to tell the office of a need, for a viewer who may
 * read it, and the need it reads there. Methods, so each module types what
 * it reads.
 */
export interface OfficeNeeds {
  query(capabilities: readonly string[]): SlotQuery<unknown> | null;
  needOf(read: unknown): OfficeNeed | null;
}

export const officeNeeds = slot<OfficeNeeds>("office needs");
