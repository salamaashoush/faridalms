import type { StudentStatus } from "@faridalms/domain/people";
import type { Facet } from "@faridalms/ui/system/index-toolbar";
import type { HeaderFact } from "@faridalms/ui/system/record-page";
import type { Tone } from "@faridalms/ui/system/status";
import type { ComponentType, ReactNode } from "react";

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
    value: string | undefined,
    onChange: (value: string | undefined) => void,
  ): Facet | null;
  /** The view gives each student a grade, to list, filter and sort by. */
  givesGrades: boolean;
  /** Where a student may stand in the view, beyond the role's own. */
  statuses: readonly StudentStatus[];
}

export const studentFilters = slot<StudentFilter>("student filters");

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
}

/** A section a module adds to the student form, saved with the student under the module's key. */
export interface StudentEditorPart {
  key: string;
  title: () => string;
  query(studentId: string | null): SlotQuery<unknown>;
  initial(read: unknown): unknown;
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
