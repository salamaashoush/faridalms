import type { StudentStatus } from "@faridalms/domain/people";
import type { Facet } from "@faridalms/ui/system/index-toolbar";
import type { HeaderFact, RecordAlert } from "@faridalms/ui/system/record-page";
import type { Tone } from "@faridalms/ui/system/status";
import type { ComponentType, ReactNode } from "react";

import type { ViewValue } from "~/components/classes/slots";
import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

export interface StudentPartProps {
  student: { id: string; name: string };
  today: string;
  manage: boolean;
}

export interface MoveOneProps {
  student: { id: string; name: string };
  today: string;
  onClose: () => void;
}

export interface MoveManyProps {
  students: readonly { id: string; name: string }[];
  today: string;
  onClose: () => void;
}

/** What a module adds to a student's classes on their record and in the list. */
export interface StudentClassesPart {
  /** A section at the head of the student's classes. */
  Section: ComponentType<StudentPartProps>;
  /** The enrolments the module keeps itself, offered without their own actions. */
  keeps: (episode: { source: string }) => boolean;
  /** Moving students between the classes the module keeps. */
  move: {
    label: () => string;
    One: ComponentType<MoveOneProps>;
    Many: ComponentType<MoveManyProps>;
  };
}

export const studentClassesParts = slot<StudentClassesPart>(
  "student classes parts",
);

/**
 * A view of the school's students a module offers on the student list,
 * kept in the address under its key: what it reads to offer it, the facet
 * it shows from that, and what its view gives each student besides.
 * Methods, so each module types what it reads.
 */
export interface StudentFilter {
  key: string;
  query(): SlotQuery<unknown>;
  facetOf(
    read: unknown,
    value: ViewValue,
    onChange: (value: ViewValue) => void,
  ): Facet | null;
  /** Where a student may stand in the view, beyond the role's own. */
  statuses: readonly StudentStatus[];
}

export const studentFilters = slot<StudentFilter>("student filters");

/**
 * A column a module adds to the student list under the key the list's rows
 * carry its values by, sorted by under the same key: what it reads to name
 * a value, its header, and the value as a cell and as text.
 */
export interface StudentColumn {
  key: string;
  header: () => string;
  query(): SlotQuery<unknown>;
  cell(read: unknown, value: string | null): ReactNode;
  text(read: unknown, value: string | null): string;
}

export const studentColumns = slot<StudentColumn>("student columns");

/** The word for where a module places a student, beside their class: their grade, say. */
export interface PlaceWords {
  place: () => string;
}

export const placeWords = slot<PlaceWords>("place words");

/** What a module shows of a student on their record. */
export interface StudentPart {
  /** Facts for the record's header, after the student's own. */
  facts: HeaderFact[];
  /** Where the student stands by the module, in place of the role's word. */
  status: { label: string; tone: Tone } | null;
  /** What the module recorded of how the student left. */
  departure: { label: string; value: ReactNode }[];
  /** A section on the record's overview. */
  Overview: ComponentType<StudentPartProps>;
  /** Sections beside the student's classes, and below them. */
  Enrolment: ComponentType<StudentPartProps>;
  EnrolmentAside: ComponentType<StudentPartProps>;
}

/**
 * A module's part of a student's record: what it reads for the student and
 * what it shows from that. Methods, so each module types what it reads.
 */
export interface StudentRecordPart {
  query(studentId: string): SlotQuery<unknown>;
  partOf(read: unknown): StudentPart | null;
}

export const studentRecordParts = slot<StudentRecordPart>(
  "student record parts",
);

export interface StudentEditorPartProps {
  read: unknown;
  /** The student edited, or null for a new one. */
  student: { id: string; version: number } | null;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Why the part's value cannot be sent yet, once the form was tried. */
  problem: string | null;
}

/** A section a module adds to the student form, saved with the student under the module's key. */
export interface StudentEditorPart {
  key: string;
  title: () => string;
  query(studentId: string | null): SlotQuery<unknown>;
  initial(read: unknown): unknown;
  /** Why the value cannot be sent, or null. */
  problem(value: unknown): string | null;
  /** What the part sends with the student for the value it edits. */
  sent(value: unknown): unknown;
  /** What the next student starts with once one is saved and another added. */
  carried(value: unknown): unknown;
  Field: ComponentType<StudentEditorPartProps>;
}

export const studentEditorParts = slot<StudentEditorPart>(
  "student editor parts",
);

export interface LeavingFieldsProps {
  read: unknown;
  value: unknown;
  onChange: (value: unknown) => void;
  /** Why the part's value cannot be sent yet, once the form was tried. */
  problem: string | null;
}

/** A way a module offers to keep a leaver reading the record after they go. */
export interface LeavingAccess {
  value: string;
  label: string;
  hint: string;
  /** The last day the record is still read, or empty for none after the last day. */
  until: string;
}

/** What a module records when students leave, from fields of its own on the leaving sheet. */
export interface LeavingPart {
  key: string;
  query(): SlotQuery<unknown>;
  initial(): unknown;
  /** Why the value cannot be sent, or null. */
  problem(value: unknown): string | null;
  Fields: ComponentType<LeavingFieldsProps>;
  /** The reading the module offers after a last day; the first is offered first. */
  access(read: unknown, lastDay: string): LeavingAccess[];
}

export const leavingParts = slot<LeavingPart>("leaving parts");

/** A flag on a student's record header, by the key the record's alerts carry it under. */
export interface StudentAlertWords {
  label: () => string;
  tone: RecordAlert["tone"];
  icon: RecordAlert["icon"];
}

/**
 * What a module that knows who acts for a student shows of them on the
 * student's record: a tab of its own, its sections on the overview, the
 * words for its header flags, and what writing to them is called.
 */
export interface StudentFamilyPart {
  label: () => string;
  Tab: ComponentType<{ studentId: string; name: string }>;
  Overview: ComponentType<{ studentId: string; manage: boolean }>;
  alerts: Readonly<Record<string, StudentAlertWords>>;
  messageLabel: () => string;
}

export const studentFamilyParts = slot<StudentFamilyPart>(
  "student family parts",
);

/** A section a module adds to a person's record overview, read for the person themself. */
export interface PersonRecordPart {
  Overview: ComponentType<{ personId: string; roles: readonly string[] }>;
}

export const personRecordParts = slot<PersonRecordPart>("person record parts");

/** What a student's record lets the viewer open, as the record answers it. */
export type StudentAccess = Readonly<Record<string, boolean>>;

/** A tab a module adds to a student's record, at its place among the record's own. */
export interface StudentRecordTab {
  value: string;
  label: () => string;
  place: number;
  /** Whether the viewer opens it, from what the record lets them. */
  shows(access: StudentAccess): boolean;
  /** Whether it sits in columns like the record's own sections, or fills the width. */
  columns?: boolean;
  Tab: ComponentType<{ studentId: string }>;
}

export const studentRecordTabs = slot<StudentRecordTab>("student record tabs");

/** What a module shows first on a student's overview: their lessons today, say. */
export interface StudentOverviewPart {
  key: string;
  place: number;
  shows(access: StudentAccess): boolean;
  Part: ComponentType<{
    studentId: string;
    today: string;
    onTab: (tab: string) => void;
  }>;
}

export const studentOverviewParts = slot<StudentOverviewPart>(
  "student overview parts",
);
