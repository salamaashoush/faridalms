import { slot } from "~/utils/extension";

/** The words for an audience a module adds to announcements and events: a grade, say. */
export interface AudienceKind {
  scope: string;
  /** The audience as a choice beside the school's own: "A grade". */
  label: () => string;
  /** What a row of it names, as its field is called: "Grade". */
  target: () => string;
  /** The empty choice: "Choose a grade". */
  pick: () => string;
}

export const audienceKinds = slot<AudienceKind>("audience kinds");
