import { useBlocker } from "@tanstack/react-router";

import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./dialog";

export function UnsavedChangesGuard({
  isDirty,
  pending,
}: {
  isDirty: () => boolean;
  pending: boolean;
}) {
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
        <DialogTitle>{m.editorLeaveTitle()}</DialogTitle>
        <DialogDescription>
          {pending ? m.editorSavingHint() : m.editorLeaveHint()}
        </DialogDescription>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => blocker.reset?.()}>
            {m.editorKeepEditing()}
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => blocker.proceed?.()}
          >
            {m.editorDiscard()}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
