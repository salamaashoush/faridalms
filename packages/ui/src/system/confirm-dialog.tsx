import { Button } from "../button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "../dialog";
import { CircleAlert, LoaderCircle } from "lucide-react";

import { useSystemStrings } from "./provider";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  error?: string;
  /** False for a confirmation that removes nothing, such as accepting an offer. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * The last step before something is removed. The destructive colour appears
 * only here, on the button that does it.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  pending = false,
  error,
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const strings = useSystemStrings();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
    >
      <DialogContent showCloseButton={false} className="gap-5 sm:max-w-md">
        <div className="grid gap-2">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {body}
          </DialogDescription>
        </div>
        {error ? (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-[13px] leading-[18px] text-destructive"
          >
            <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onCancel}
          >
            {cancelLabel ?? strings.cancel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
