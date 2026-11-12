import { slot } from "~/utils/extension";

/** The words for an audience a module adds to announcements and events: a grade, say. */
export type AudienceKind = {
  scope: string;
  /** The audience as a choice beside the school's own: "A grade". */
  label: () => string;
} & (
  | {
      /** What a row of it names, as its field is called: "Grade". */
      target: () => string;
      /** The empty choice: "Choose a grade". */
      pick: () => string;
    }
  | { target?: never; pick?: never }
);

export const audienceKinds = slot<AudienceKind>("audience kinds");

/** The module's kind for a scope when it names no target: every family, say. */
export const wholeKind = (
  kinds: readonly AudienceKind[],
  scope: string,
): AudienceKind | undefined =>
  kinds.find((kind) => kind.scope === scope && kind.target === undefined);
