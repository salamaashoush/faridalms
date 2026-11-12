import type { LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

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

/**
 * A card a module adds beside the office's day, from what it reads for a
 * viewer who may read it; null shows nothing. Methods, so each module types
 * what it reads.
 */
export interface OfficeCard {
  query(capabilities: readonly string[]): SlotQuery<unknown> | null;
  cardOf(read: unknown): ReactNode;
}

export const officeCards = slot<OfficeCard>("office cards");

/** A child as a family's home shows them. */
export interface FamilyChild {
  studentId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  preferredGivenName?: string | null;
}

/**
 * What a module asks or tells a family about one child on their home, from
 * what it reads for a family who may read it; null reads nothing. Methods,
 * so each module types what it reads.
 */
export interface FamilyChildPart {
  query(capabilities: readonly string[]): SlotQuery<unknown> | null;
  partOf(read: unknown, child: FamilyChild): ReactNode;
}

export const familyChildParts = slot<FamilyChildPart>("family child parts");
