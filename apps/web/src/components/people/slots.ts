import type { ComponentType } from "react";

import type { YearBounds } from "~/components/classes/Enrolment";

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
  year: YearBounds;
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
