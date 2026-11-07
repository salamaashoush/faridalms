import type { ReactNode } from "react";

export interface CellWithNoteProps {
  /** What the row is, in the cell's own weight. */
  children: ReactNode;
  /** Free text about the row, such as why it was done. */
  note?: string | null;
}

/**
 * A table cell's subject with a note under it on one muted line: a reason
 * or a comment reads beside what it is about instead of in a narrow column
 * of its own, which wrapped every row to several lines. A long note is cut
 * off with an ellipsis; the whole of it shows on hover and stays in the
 * page, so a screen reader reads it all.
 */
export function CellWithNote({ children, note }: CellWithNoteProps) {
  return (
    <span className="grid min-w-0 py-2">
      <span className="truncate font-medium">{children}</span>
      {note ? (
        <span
          dir="auto"
          title={note}
          className="truncate text-[13px] leading-[18px] text-muted-foreground"
        >
          {note}
        </span>
      ) : null}
    </span>
  );
}
