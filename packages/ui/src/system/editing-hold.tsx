import { Button } from "../button";
import { LoaderCircle, LockKeyhole } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "./confirm-dialog";
import { useSystemStrings } from "./provider";

export interface EditingHoldProps {
  /**
   * `held`: someone else is editing and the viewer reads. `taken`: the
   * viewer was editing and someone took it over.
   */
  state: "held" | "taken";
  /** Who holds it now. */
  holder: string;
  /** When they began, as the reader reads a time. */
  since: string;
  /** Takes it over, after asking; offered while someone else holds it. */
  onTakeOver?: () => void;
  taking?: boolean;
  /** What the viewer may do with a change that was not saved when it was taken. */
  unsaved?: { onCopy: () => void; onCompare: () => void };
}

/**
 * The line above a document someone else is editing: who and since when,
 * and that the viewer reads it. While another person holds it the viewer
 * may take it over; once it was taken from them, a change they had not
 * saved is offered to copy or to compare with the saved version.
 */
export function EditingHold({
  state,
  holder,
  since,
  onTakeOver,
  taking = false,
  unsaved,
}: EditingHoldProps) {
  const strings = useSystemStrings();
  const [asking, setAsking] = useState(false);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
    >
      <p className="flex min-w-0 flex-1 basis-64 items-start gap-2">
        <LockKeyhole
          className="mt-0.5 size-4 shrink-0 text-warning-foreground dark:text-warning"
          aria-hidden
        />
        <span>
          {state === "held"
            ? strings.holdHeld(holder, since)
            : strings.holdTaken(holder, since)}
          {state === "taken" && unsaved ? ` ${strings.holdUnsaved}` : null}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {state === "taken" && unsaved ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={unsaved.onCopy}
            >
              {strings.holdCopy}
            </Button>
            <Button type="button" size="sm" onClick={unsaved.onCompare}>
              {strings.holdCompare}
            </Button>
          </>
        ) : null}
        {onTakeOver ? (
          <Button
            type="button"
            size="sm"
            variant={state === "taken" ? "outline" : "default"}
            disabled={taking}
            onClick={() => setAsking(true)}
          >
            {taking ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : null}
            {strings.holdTakeOver}
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={asking}
        title={strings.holdTakeOverTitle(holder)}
        body={strings.holdTakeOverBody(holder)}
        confirmLabel={strings.holdTakeOver}
        destructive={false}
        onConfirm={() => {
          setAsking(false);
          onTakeOver?.();
        }}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
