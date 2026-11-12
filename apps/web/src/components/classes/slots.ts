import type { ClassDirectoryQuery } from "@faridalms/domain/classes";
import type { PrimaryAction } from "@faridalms/ui/system/action-menu";
import type { QueryClient } from "@tanstack/react-query";
import type { useNavigate } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";

import type { YearBounds } from "~/components/classes/Enrolment";
import type { classRecordQuery } from "~/queries/classes";
import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

export type ClassRecordData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classRecordQuery>["queryFn"]>>
>;

export interface ClassesTabProps {
  search: ClassDirectoryQuery;
  onSearch: (change: Partial<ClassDirectoryQuery>) => void;
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
    search: ClassDirectoryQuery,
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
    year: YearBounds;
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

/** The words for the class a student belongs to, where a module gives one. */
export interface GroupWords {
  group: () => string;
  teacher: () => string;
}

export const groupWords = slot<GroupWords>("group words");
