import { Button } from "../button";
import { useBlocker } from "@tanstack/react-router";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";
import { useSystemStrings } from "./provider";

export interface UnsavedChangesGuardProps {
  isDirty: () => boolean;
  /** A save under way: leaving waits for it rather than discarding. */
  pending: boolean;
}

/**
 * Asks before a page with unsaved changes is left, in the app or by closing
 * the tab, with Discard held back while a save is still in flight.
 */
export function UnsavedChangesGuard({
  isDirty,
  pending,
}: UnsavedChangesGuardProps) {
  const strings = useSystemStrings();
  const blocker = useBlocker({
    shouldBlockFn: () => isDirty(),
    enableBeforeUnload: () => isDirty(),
    withResolver: true,
  });
  return (
    <Dialog
      open={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.();
      }}
    >
      <DialogContent>
        <DialogTitle>{strings.leaveTitle}</DialogTitle>
        <DialogDescription>
          {pending ? strings.leaveWhileSavingHint : strings.leaveHint}
        </DialogDescription>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => blocker.reset?.()}>
            {strings.keepEditing}
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => blocker.proceed?.()}
          >
            {strings.discardChanges}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
