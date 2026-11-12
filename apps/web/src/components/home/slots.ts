import type { Capability } from "@faridalms/domain/capabilities";
import type { Tone } from "@faridalms/ui/system/status";
import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

/** Something the office should see to on Today. */
export interface OfficeNeed {
  key: string;
  label: string;
  link: LinkProps;
  /** What the office can do about it at once, shown under the list. */
  footer?: ReactNode;
}

/**
 * What a module reads to tell the office of a need, for a viewer who may
 * read it, and the need it reads there. Methods, so each module types what
 * it reads.
 */
export interface OfficeNeeds {
  /** Where it sits among the needs, low first. */
  place?: number;
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
  /** In the day's main column, or beside it where none is named. */
  area?: "main" | "side";
  /** Where it sits in its column, low first. */
  place?: number;
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

/**
 * A card a module adds to a teacher's or a learner's Today, at its place in
 * its column, from what it reads for a viewer who may read it; null reads
 * nothing and shows nothing. A card that `foldsInto` another is left out
 * where that one shows, as registers fold into the lessons that hold them.
 */
export interface TodayCard {
  key: string;
  place: number;
  area: "main" | "side";
  foldsInto?: string;
  query(capabilities: readonly string[]): SlotQuery<unknown> | null;
  cardOf(read: unknown): ReactNode;
}

export const teacherCards = slot<TodayCard>("teacher cards");
export const learnerCards = slot<TodayCard>("learner cards");

/** Something on a child's day that needs the family, ranked against the others. */
export interface ChildAttention {
  key: string;
  rank: number;
  label: string;
  link: LinkProps;
  fact?: string | null;
}

/** What a module says of one child's day on a family's home. */
export interface ChildDay {
  /** Lines under the child's name: the lesson on now, say. */
  lines?: string[];
  status?: { label: string; tone: Tone };
  attention?: ChildAttention[];
  sections?: {
    key: string;
    title: string;
    items: { key: string; title: ReactNode; facts: (string | null)[] }[];
  }[];
}

/**
 * What a module reads of one child's day for a family who may read it, and
 * what it says of it; null reads nothing.
 */
export interface ChildDayPart {
  key: string;
  place: number;
  query(
    studentId: string,
    capabilities: readonly string[],
  ): SlotQuery<unknown> | null;
  dayOf(read: unknown, child: FamilyChild): ChildDay;
}

export const childDayParts = slot<ChildDayPart>("child day parts");

/** Something a young child does next, as a big card on their home. */
export interface YoungTask {
  key: string;
  title: string;
  subtitle: string;
  /** What picks its colour, so a child finds the same subject by it. */
  toneOf: string;
  icon: LucideIcon;
  begun: boolean;
  link:
    | { to: "/lessons/$lessonId"; params: { lessonId: string } }
    | { to: "/assignments/$assignmentId"; params: { assignmentId: string } };
}

/** What a module gives a young child to do next, in its place among the others. */
export interface YoungTasks {
  place: number;
  query(capabilities: readonly string[]): SlotQuery<unknown> | null;
  tasksOf(read: unknown): YoungTask[];
}

export const youngTasks = slot<YoungTasks>("young tasks");

/**
 * The words of a setup step and the page that takes it. A module's words
 * for a step of core's take the place of core's, to say what it adds.
 */
export interface SetupStepWords {
  id: string;
  title: () => string;
  body: () => string;
  /** What the page that takes the step asks of whoever opens it. */
  capability: Capability;
  link: LinkProps;
}

export const setupStepWords = slot<SetupStepWords>("setup step words");

/** How the setup's list names one of a module's first steps. */
export interface SetupItemWords {
  item: string;
  label: () => string;
}

export const setupItemWords = slot<SetupItemWords>("setup item words");
