import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Button } from "@faridalms/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@faridalms/ui/tooltip";
import { LoaderCircle, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";

import { StudioFrame } from "./StudioFrame";
import { useStudioFrame } from "./useStudioFrame";

export const PROJECT_TYPE = "application/x.scratch.sb3";
/**
 * Quiet time after the last change before a project saves itself. Each save
 * stores the whole project, so it waits for a pause rather than every edit;
 * closing the studio always saves.
 */
const AUTOSAVE_MS = 30_000;

type SaveState = "idle" | "saving" | "saved" | "failed";

/**
 * The coding studio over the page: the block-coding editor runs in a frame
 * on its own domain, and this page keeps the project. A project is saved
 * some seconds after the last change, and always before the studio closes,
 * so a child's work is never lost to a closed tab or a stray Escape.
 */
export function CodingStudio({
  projectUrl,
  mode,
  title,
  onSave,
  onClose,
}: {
  /** Where the project to open is read from; none opens the studio's starter. */
  projectUrl: string | null;
  mode: "editor" | "player";
  title: string;
  /** Keeps a saved project; the editor saves through it, a player never does. */
  onSave?: (project: Blob, thumbnail: Blob | null) => Promise<void>;
  onClose: () => void;
}) {
  const done = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<SaveState>("idle");
  const dirty = useRef(false);
  const timer = useRef(0);
  const closing = useRef(false);
  const studio = useStudioFrame({
    projectUrl,
    mode,
    onChanged: () => {
      if (!onSave) return;
      dirty.current = true;
      setState("idle");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void save(), AUTOSAVE_MS);
    },
  });

  const save = async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    if (!onSave || !dirty.current) return true;
    dirty.current = false;
    setState("saving");
    try {
      const result = await studio.save();
      await onSave(
        new Blob([result.project], { type: PROJECT_TYPE }),
        result.thumbnail
          ? new Blob([result.thumbnail], { type: "image/png" })
          : null,
      );
      setState("saved");
      return true;
    } catch {
      dirty.current = true;
      setState("failed");
      return false;
    }
  };

  const close = async () => {
    if (closing.current) return;
    closing.current = true;
    const kept = await save();
    closing.current = false;
    if (kept) onClose();
    else toast.error(m.studioSaveFailed());
  };

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.clearTimeout(timer.current);
    };
  }, []);

  const { source, loaded, frame } = studio;

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Popup
          initialFocus={done}
          className="fixed inset-0 z-50 flex flex-col bg-background text-foreground outline-none"
        >
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 lg:px-3">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="max-md:size-10"
                    aria-label={m.studioClose()}
                    onClick={() => void close()}
                  />
                }
              >
                <X aria-hidden />
              </TooltipTrigger>
              <TooltipContent>{m.studioClose()}</TooltipContent>
            </Tooltip>
            <div className="grid min-w-0 flex-1">
              <DialogPrimitive.Title className="text-sm leading-5 font-semibold">
                {m.studioTitle()}
              </DialogPrimitive.Title>
              <p className="truncate text-[13px] leading-[18px] text-muted-foreground">
                <bdi>{title}</bdi>
              </p>
            </div>
            {onSave ? (
              <SaveStatus state={state} />
            ) : mode === "editor" ? (
              <span className="text-[13px] text-muted-foreground max-sm:sr-only">
                {m.studioNotKept()}
              </span>
            ) : null}
            {onSave ? (
              <Button
                ref={done}
                type="button"
                className="max-md:h-10"
                disabled={state === "saving"}
                onClick={() => void close()}
              >
                {m.studioDone()}
              </Button>
            ) : null}
          </header>
          <div className="relative min-h-0 flex-1">
            {source ? (
              <StudioFrame
                frame={frame}
                source={source}
                title={m.studioTitle()}
              />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                {m.studioUnavailable()}
              </p>
            )}
            {source && !loaded ? (
              <div className="absolute inset-0 grid place-items-center bg-background">
                <LoaderCircle
                  className="size-6 animate-spin text-muted-foreground"
                  aria-label={m.studioLoading()}
                />
              </div>
            ) : null}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  if (state === "saving")
    return (
      <span className="text-[13px] text-muted-foreground" aria-live="polite">
        {m.studioSaving()}
      </span>
    );
  if (state === "saved")
    return (
      <span className="text-[13px] text-muted-foreground" aria-live="polite">
        {m.studioSaved()}
      </span>
    );
  if (state === "failed")
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[13px] text-destructive"
        role="alert"
      >
        <TriangleAlert className="size-3.5" aria-hidden />
        {m.studioSaveFailed()}
      </span>
    );
  return null;
}
