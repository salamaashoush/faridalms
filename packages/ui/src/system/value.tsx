import type { ReactNode } from "react";

import { useSystemStrings } from "./provider";

export interface ValueProps {
  children?: ReactNode;
  // A value that cannot exist for this record, such as a grade for a student
  // with no class, is a dash: "Not recorded" would suggest someone forgot it.
  notApplicable?: boolean;
  /**
   * What its absence means here, such as "No guardian" or "Nobody yet",
   * when nothing is missing from the record: there is simply none.
   */
  absent?: string;
}

/**
 * A field value that can legitimately be absent.
 *
 * The old portal printed a label and then nothing, so a parent could not tell
 * a missing birthdate from a rendering bug. Absence is stated, in words.
 */
export function Value({
  children,
  notApplicable = false,
  absent,
}: ValueProps) {
  const strings = useSystemStrings();
  if (notApplicable)
    return (
      <span className="text-muted-foreground">
        <span aria-hidden>—</span>
        <span className="sr-only">{strings.notApplicable}</span>
      </span>
    );
  const empty =
    children === null ||
    children === undefined ||
    children === "" ||
    (typeof children === "string" && children.trim() === "");

  if (empty && absent)
    return <span className="text-muted-foreground">{absent}</span>;
  if (empty) {
    return (
      <span className="text-muted-foreground italic">
        {strings.notRecorded}
      </span>
    );
  }
  return <>{children}</>;
}
