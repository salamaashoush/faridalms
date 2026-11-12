import type { SubmissionFormat } from "@faridalms/domain/coursework";
import type { ComponentType } from "react";

import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

export interface AssignmentEditorPartProps {
  classId: string;
  format: SubmissionFormat;
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
  /** The editor's section it sits in. */
  section: "grading" | "discussion";
  /** What the part keeps for work already written, for the form to start from. */
  initial(assignment: { id: string; classId: string }): SlotQuery<string>;
  /** The value no longer holds once the work moves to another class. */
  belongsToClass?: boolean;
  /** The format new work takes when it starts with a value for this part. */
  startsAs?: SubmissionFormat;
  /** Who takes part is the module's to decide at this value, rather than the teacher's. */
  decidesAudience?(value: string, format: SubmissionFormat): boolean;
  Field: ComponentType<AssignmentEditorPartProps>;
}

export const assignmentEditorParts = slot<AssignmentEditorPart>(
  "assignment editor parts",
);
