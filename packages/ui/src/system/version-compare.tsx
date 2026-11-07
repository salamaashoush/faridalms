import type { ReactNode } from "react";

import { Button } from "../button";
import { cn } from "../cn";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Segmented } from "./panel";
import { useSystemStrings } from "./provider";

export interface VersionCompareProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Why they differ: `stale` when someone saved meanwhile and the viewer's
   * save was refused, `taken` when the document was taken over from them.
   */
  reason: "stale" | "taken";
  /** Who took it over, named when it was taken. */
  holder?: string;
  /** The viewer's version that was not saved, drawn as its readers see it. */
  mine: ReactNode;
  /** The version stored now, drawn the same way; null while it loads. */
  saved: ReactNode | null;
  /** Saves the viewer's version over the stored one, taking it over first when it was taken. */
  onKeepMine: () => void;
  /** Drops the viewer's version for the stored one. */
  onKeepSaved: () => void;
  pending?: boolean;
}

type Side = "mine" | "saved";

/**
 * Two versions of one document side by side, each drawn by the app's own
 * renderer as readers see it, and the choice of which to keep. On a phone
 * one shows at a time, chosen above them.
 */
export function VersionCompare({
  open,
  onOpenChange,
  reason,
  holder = "",
  mine,
  saved,
  onKeepMine,
  onKeepSaved,
  pending = false,
}: VersionCompareProps) {
  const strings = useSystemStrings();
  const [shown, setShown] = useState<Side>("mine");
  const label: Record<Side, string> = {
    mine: strings.compareMine,
    saved: strings.compareSaved,
  };
  const pane = (side: Side, body: ReactNode | null) => (
    <section
      aria-label={label[side]}
      className={cn(
        "grid min-w-0 content-start gap-2",
        shown !== side && "max-sm:hidden",
      )}
    >
      <h3 className="text-xs leading-4 font-semibold tracking-wide text-muted-foreground uppercase max-sm:sr-only">
        {label[side]}
      </h3>
      <div className="max-h-[60dvh] min-w-0 overflow-y-auto rounded-lg border bg-card p-4">
        {body ?? (
          <LoaderCircle
            className="mx-auto size-5 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
      </div>
    </section>
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="gap-4 sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{strings.compareTitle}</DialogTitle>
          <DialogDescription>
            {reason === "taken"
              ? strings.compareTakenBody(holder)
              : strings.compareBody}
          </DialogDescription>
        </DialogHeader>
        <Segmented
          label={strings.compareVersions}
          value={shown}
          options={[
            { value: "mine", label: strings.compareMine },
            { value: "saved", label: strings.compareSaved },
          ]}
          onChange={setShown}
          className="sm:hidden"
        />
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {pane("mine", mine)}
          {pane("saved", saved)}
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending || saved === null}
            onClick={onKeepSaved}
          >
            {strings.compareKeepSaved}
          </Button>
          <Button
            type="button"
            disabled={pending || saved === null}
            onClick={onKeepMine}
          >
            {pending ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : null}
            {reason === "taken"
              ? strings.compareTakeAndKeepMine
              : strings.compareKeepMine}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
