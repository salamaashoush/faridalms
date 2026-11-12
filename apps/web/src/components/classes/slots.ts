import type { Capability } from "@faridalms/domain/capabilities";
import type { ClassDirectoryQuery, Views } from "@faridalms/domain/classes";
import type { OpenSpan } from "@faridalms/domain/school";
import type { PrimaryAction } from "@faridalms/ui/system/action-menu";
import type { Facet } from "@faridalms/ui/system/index-toolbar";
import type { Tone } from "@faridalms/ui/system/status";
import type { QueryClient } from "@tanstack/react-query";
import type { useNavigate } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";

import type { classRecordQuery } from "~/queries/classes";
import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

export type ClassRecordData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classRecordQuery>["queryFn"]>>
>;

/** The classes page's address: its own filters, and the views modules keep under their keys. */
export type ClassesSearch = ClassDirectoryQuery & Record<string, unknown>;

export interface ClassesTabProps {
  search: ClassesSearch;
  onSearch: (change: Partial<ClassesSearch>) => void;
  title: string;
  /** Places the list where the page wants it, below the header. */
  frame: (content: ReactNode) => ReactNode;
}

/** A tab of the Classes page for whoever oversees the school's classes. */
export interface ClassesTab {
  value: string;
  label: () => string;
  prefetch: (
    queryClient: QueryClient,
    search: ClassesSearch,
    views: Views,
  ) => Promise<unknown>;
  Tab: ComponentType<ClassesTabProps>;
}

export const classesTabs = slot<ClassesTab>("classes tabs");

export interface RosterStudent {
  userId: string;
  name: string;
  enrollmentId: string;
  version: number;
  from: string;
}

/** How a class's students are put in and taken out, where a module keeps them. */
export interface RosterKeeping {
  add: (input: {
    studentId: string;
    from: string;
  }) => Promise<{ moved: boolean }>;
  withdraw: (input: {
    studentId: string;
    enrollmentId: string;
    expectedVersion: number;
    on: string;
  }) => Promise<unknown>;
  /** A sheet that moves a student to another class, where students move. */
  move?: (input: {
    student: RosterStudent;
    runs: OpenSpan;
    today: string;
    onClose: () => void;
  }) => ReactNode;
}

/** What a module shows of a class on its record. */
export interface ClassPart {
  /** Sections at the head of the overview. */
  overview?: ReactNode;
  /** The record's edit action, in place of the class's own. */
  edit?: PrimaryAction | null;
  /** How the class's primary teacher is named. */
  primaryTeacher?: string;
  /** What the roster is, under its heading. */
  rosterNote?: string;
  /** The roster as the module keeps it; null keeps it closed to changes. */
  roster?: RosterKeeping | null;
  /** Facts about the class, after its own. */
  facts?: { label: string; value: ReactNode }[];
  /** A word on the class's standing beside its title. */
  status?: { label: string; tone: Tone };
}

/**
 * A module's part of a class's record: what it reads for the class, and
 * what it shows from that. Methods, so each module types what it reads.
 */
export interface ClassRecordPart {
  query(classId: string): SlotQuery<unknown>;
  partOf(
    read: unknown,
    record: ClassRecordData,
    navigate: ReturnType<typeof useNavigate>,
  ): ClassPart | null;
}

export const classRecordParts = slot<ClassRecordPart>("class record parts");

export interface ClassRecordSectionProps {
  classId: string;
  /** The class is of young children, as a module knows it. */
  young: boolean;
  /** The viewer teaches the class or keeps the school's classes. */
  keeps: boolean;
  /** The viewer may change the class itself. */
  manages: boolean;
}

/** A section a module adds beside a class's overview: how its lessons sound, say. */
export interface ClassRecordSection {
  key: string;
  /** Where it sits among the sections, low first. */
  place?: number;
  Section: ComponentType<ClassRecordSectionProps>;
}

/** A tab a module adds to a class's record, at its place among the record's own. */
export interface ClassRecordTab {
  value: string;
  label: () => string;
  place: number;
  /** Who sees it; any one of these. */
  capability: Capability | readonly Capability[];
  /** Whether the class has it at all: goals only for a class of young children, say. */
  shows?: (record: ClassRecordData) => boolean;
  Tab: ComponentType<{ classId: string }>;
}

export const classRecordTabs = slot<ClassRecordTab>("class record tabs");

export const classRecordSections = slot<ClassRecordSection>(
  "class record sections",
);

/**
 * What a module says beside each class in a student's class history, read
 * once for the student: the year a class belonged to, say.
 */
export interface ClassHistoryNote {
  query(studentId: string): SlotQuery<unknown>;
  noteOf(read: unknown, classId: string): string | null;
}

export const classHistoryNotes = slot<ClassHistoryNote>("class history notes");

/** The words for the class a student belongs to, where a module gives one. */
export interface GroupWords {
  group: () => string;
  teacher: () => string;
}

export const groupWords = slot<GroupWords>("group words");

/** What a module's view holds in an address: one value, several, or none. */
export type ViewValue = string | readonly string[] | undefined;

/**
 * A view of the school's classes a module offers on the lists of classes,
 * kept in the address under its key: what it reads to offer it, and the
 * facet it shows from that. Methods, so each module types what it reads.
 */
export interface ClassFilter {
  key: string;
  /** Offered on the lists of classes themselves, not on lists of what classes hold (work, modules). */
  directoryOnly?: boolean;
  /** Whether the view at this value names the classes listed, rather than leaving every class. */
  narrows(value: ViewValue): boolean;
  query(): SlotQuery<unknown>;
  facetOf(
    read: unknown,
    value: ViewValue,
    onChange: (value: ViewValue) => void,
  ): Facet | null;
}

export const classFilters = slot<ClassFilter>("class filters");

/**
 * A column a module adds to the lists of classes, under the key the list's
 * rows carry its values by: what it reads to name a value, its header and
 * its cell. Methods, so each module types what it reads.
 */
export interface ClassColumn {
  key: string;
  header: () => string;
  query(): SlotQuery<unknown>;
  cell(read: unknown, value: string | null): ReactNode;
}

export const classColumns = slot<ClassColumn>("class columns");

/** What the class form holds that a module's field may read and change. */
export interface ClassFormDays {
  startsOn: string;
  endsOn: string;
}

export interface ClassEditorPartProps {
  /** What the module read for the class, or for a new one. */
  read: unknown;
  /** The class form's address, which may carry the module's view. */
  search: Readonly<Record<string, unknown>>;
  value: unknown;
  days: ClassFormDays;
  onChange: (value: unknown, days?: ClassFormDays) => void;
}

/**
 * A field a module adds to the class form, saved with the class under the
 * module's key: the year a class belongs to among its days, or the grade it
 * teaches among its details.
 */
export interface ClassEditorPart {
  key: string;
  section: "details" | "days";
  query(classId: string | null): SlotQuery<unknown>;
  /** The part's value for the form to start from, and the days it starts on, if it sets them. */
  initial(
    read: unknown,
    search: Readonly<Record<string, unknown>>,
  ): { value: unknown; days?: ClassFormDays };
  Field: ComponentType<ClassEditorPartProps>;
}

export const classEditorParts = slot<ClassEditorPart>("class editor parts");

/** A module's view as an address holds it, or undefined for none. */
export function viewValue(value: unknown): ViewValue {
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value)) {
    const values = value.filter(
      (item): item is string => typeof item === "string" && item !== "",
    );
    return values.length > 0 ? values : undefined;
  }
  return undefined;
}

/** The views modules keep in an address, by key, for the API to narrow a list by. */
export function viewsOf(
  filters: readonly { key: string }[],
  search: Readonly<Record<string, unknown>>,
): Record<string, string | string[]> {
  return Object.fromEntries(
    filters.flatMap((filter) => {
      const value = viewValue(search[filter.key]);
      return value === undefined
        ? []
        : [[filter.key, typeof value === "string" ? value : [...value]]];
    }),
  );
}

/**
 * A module's words for a list core or another module keeps, in place of its
 * own: a list of the year's classes names the year, say.
 */
export interface ListWords {
  list: "classes" | "classesTaught" | "homerooms";
  title?: () => string;
  body?: () => string;
  caption?: () => string;
}

export const listWords = slot<ListWords>("list words");
