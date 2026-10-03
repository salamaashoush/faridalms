import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Button } from "@faridalms/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@faridalms/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, TriangleAlert, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { studioQuery } from "~/queries/studio";

export const PROJECT_TYPE = "application/x.scratch.sb3";
/**
 * Quiet time after the last change before a project saves itself. Each save
 * stores the whole project, so it waits for a pause rather than every edit;
 * closing the studio always saves.
 */
const AUTOSAVE_MS = 30_000;

type FromStudio =
  | { type: "ready" | "loaded" | "changed" }
  | { type: "error"; code: string }
  | {
      type: "saved";
      id: string;
      project: ArrayBuffer;
      thumbnail: ArrayBuffer | null;
    };

type SaveState = "idle" | "saving" | "saved" | "failed";

/**
 * The coding studio over the page: the block-coding editor runs in a frame
 * on its own domain, and this page keeps the project. A project is fetched
 * and handed in once the studio is ready, saved a few seconds after the last
 * change, and always saved before the studio closes, so a child's work is
 * never lost to a closed tab or a stray Escape.
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
  const origin = useQuery(studioQuery).data?.origin ?? null;
  const frame = useRef<HTMLIFrameElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<SaveState>("idle");
  const dirty = useRef(false);
  const timer = useRef(0);
  const waiting = useRef(
    new Map<string, (saved: Extract<FromStudio, { type: "saved" }>) => void>(),
  );
  const closing = useRef(false);

  const post = (
    message: Record<string, unknown>,
    transfer: Transferable[] = [],
  ) => {
    if (!origin) return;
    frame.current?.contentWindow?.postMessage(
      { source: "farida", ...message },
      origin,
      transfer,
    );
  };

  const save = async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    if (!onSave || !dirty.current) return true;
    dirty.current = false;
    setState("saving");
    const id = crypto.randomUUID();
    const saved = new Promise<Extract<FromStudio, { type: "saved" }>>(
      (resolve) => waiting.current.set(id, resolve),
    );
    post({ type: "save", id });
    try {
      const result = await saved;
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

  const receive = useEffectEvent(async (data: FromStudio) => {
    switch (data.type) {
      case "ready": {
        let bytes: ArrayBuffer | null = null;
        if (projectUrl) {
          const response = await fetch(projectUrl);
          if (response.ok) bytes = await response.arrayBuffer();
          else toast.error(m.studioLoadFailed());
        }
        post({ type: "load", project: bytes }, bytes ? [bytes] : []);
        return;
      }
      case "loaded":
        setLoaded(true);
        return;
      case "error":
        setLoaded(true);
        toast.error(m.studioLoadFailed());
        return;
      case "changed":
        if (!onSave) return;
        dirty.current = true;
        setState("idle");
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void save(), AUTOSAVE_MS);
        return;
      case "saved":
        waiting.current.get(data.id)?.(data);
        waiting.current.delete(data.id);
    }
  });

  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (
        !origin ||
        event.origin !== origin ||
        event.source !== frame.current?.contentWindow ||
        (event.data as { source?: unknown } | null)?.source !== "farida-scratch"
      )
        return;
      void receive(event.data as FromStudio);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [origin]);

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

  const source = origin
    ? `${origin}/?${new URLSearchParams({
        parent: window.location.origin,
        mode,
        locale: getLocale(),
      })}`
    : null;

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
              <iframe
                ref={frame}
                src={source}
                title={m.studioTitle()}
                allow="camera; microphone; fullscreen"
                // Its own origin, scripts, sounds and dialogs, but never the
                // page around it.
                sandbox="allow-scripts allow-same-origin allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads"
                className="size-full border-0"
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
