import type { SubmissionFormat } from "@faridalms/domain/coursework";
import type { ComponentType } from "react";

import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

export interface AssignmentEditorPartProps {
  classId: string;
  format: SubmissionFormat;
  /** The work's due time as its date field holds it, empty for none. */
  dueAt: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * A field a module adds to the assignment editor, saved with the work
 * under the module's key: the term it counts toward, say, or the module a
 * discussion stands in.
 */
export interface AssignmentEditorPart {
  key: string;
  /** The editor's section it sits in, or a section of its own it draws itself. */
  section: "grading" | "discussion" | "own";
  /** What the part keeps for work already written, for the form to start from. */
  initial(assignment: { id: string; classId: string }): SlotQuery<string>;
  /** The value no longer holds once the work moves to another class. */
  belongsToClass?: boolean;
  /** The format new work takes when it starts with a value for this part. */
  startsAs?: SubmissionFormat;
  /** Who takes part is the module's to decide at this value, rather than the teacher's. */
  decidesAudience?(value: string, format: SubmissionFormat): boolean;
  /** What is saved for the value at this format, where the format changes it. */
  sent?(value: string, format: SubmissionFormat): string;
  Field: ComponentType<AssignmentEditorPartProps>;
}

export const assignmentEditorParts = slot<AssignmentEditorPart>(
  "assignment editor parts",
);

/**
 * A way a module lets a teacher pass students' handed-in work on to those
 * who follow them, or take it back, and the words for it.
 */
export interface WorkSharing {
  /** The students whose work for the assignment is passed on. */
  query(assignmentId: string): SlotQuery<readonly string[]>;
  share(input: {
    assignmentId: string;
    studentIds: string[];
    shared: boolean;
  }): Promise<unknown>;
  words: {
    share: () => string;
    unshare: () => string;
    /** Beside a student's work that is passed on. */
    mark: () => string;
    shared: () => string;
    unshared: () => string;
  };
}

export const workSharing = slot<WorkSharing>("work sharing");

/** A fact a module adds to an assignment's settings, or null where it has none. */
export interface AssignmentFact {
  key: string;
  Fact: ComponentType<{ assignmentId: string }>;
}

export const assignmentFacts = slot<AssignmentFact>("assignment facts");

/**
 * A tab a module adds to an assignment's record for its teachers, where
 * what it reads shows the tab belongs. Methods, so each module types what
 * it reads.
 */
export interface AssignmentRecordTab {
  value: string;
  label: () => string;
  query(assignmentId: string): SlotQuery<unknown>;
  shows(read: unknown, access: { grade: boolean }): boolean;
  Tab: ComponentType<{ assignmentId: string }>;
}

export const assignmentRecordTabs = slot<AssignmentRecordTab>(
  "assignment record tabs",
);

/**
 * What a module shows beside one student's work: to the teacher marking
 * it, or to the student working on it. It reads what it needs itself and
 * shows nothing where it has nothing.
 */
export interface WorkPart {
  key: string;
  where: "grading" | "learner";
  Part: ComponentType<{ assignmentId: string; studentId: string }>;
}

export const workParts = slot<WorkPart>("work parts");

/** A section a module adds under a student's work on their record, such as their term results. */
export interface StudentWorkSection {
  key: string;
  Section: ComponentType<{ studentId: string }>;
}

export const studentWorkSections = slot<StudentWorkSection>(
  "student work sections",
);

export interface CriterionStandardsProps {
  value: readonly string[];
  onChange: (value: string[]) => void;
}

/** What a rubric's criterion counts toward, where the school keeps standards. */
export const criterionStandards = slot<ComponentType<CriterionStandardsProps>>(
  "criterion standards",
);
