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

/**
 * A view of the school's classes a module offers on the lists of classes,
 * kept in the address under its key: what it reads to offer it, and the
 * facet it shows from that. Methods, so each module types what it reads.
 */
export interface ClassFilter {
  key: string;
  /** Whether the view at this value names the classes listed, rather than leaving every class. */
  narrows(value: string | undefined): boolean;
  query(): SlotQuery<unknown>;
  facetOf(
    read: unknown,
    value: string | undefined,
    onChange: (value: string | undefined) => void,
  ): Facet | null;
}

export const classFilters = slot<ClassFilter>("class filters");

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
 * module's key: the year a class belongs to, say.
 */
export interface ClassEditorPart {
  key: string;
  query(classId: string | null): SlotQuery<unknown>;
  /** The part's value for the form to start from, and the days it starts on, if it sets them. */
  initial(
    read: unknown,
    search: Readonly<Record<string, unknown>>,
  ): { value: unknown; days?: ClassFormDays };
  Field: ComponentType<ClassEditorPartProps>;
}

export const classEditorParts = slot<ClassEditorPart>("class editor parts");

/** The views modules keep in an address, by key, for the API to narrow a list by. */
export function viewsOf(
  filters: readonly { key: string }[],
  search: Readonly<Record<string, unknown>>,
): Record<string, string> {
  return Object.fromEntries(
    filters.flatMap((filter) => {
      const value = search[filter.key];
      return typeof value === "string" && value ? [[filter.key, value]] : [];
    }),
  );
}
