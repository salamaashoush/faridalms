import type { ProjectFile } from "@faridalms/domain/project";
import type { EditorHandle } from "@faridalms/makecode/Studio";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { MAX_PROJECT_BYTES, projectBytes } from "@faridalms/domain/project";
import { EditorFrame } from "@faridalms/makecode/Studio";
import { Button } from "@faridalms/ui/button";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@faridalms/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { Info, RotateCcw, TriangleAlert, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { playQuery } from "~/queries/play";

import type { StudioProps } from "./WebProjectStudio";

import { SaveStatus } from "./CodingStudio";
import { useKeptFiles } from "./useKeptFiles";

/**
 * A micro:bit project over the page: the board's own editor, with its
 * blocks, JavaScript and Python and the board that runs them beside. The
 * files host serves the editor; this studio hands it the project, keeps
 * each change the editor tells of, and asks it for the last of them before
 * closing. A project only looked at is opened where nothing can be
 * changed, and whatever the editor says of it is let go.
 */
export function DeviceStudio({
  title,
  files: given,
  starter,
  note,
  onKeep,
  unkept = false,
  action,
  onClose,
}: StudioProps) {
  const host = useQuery(playQuery);
  const origin = host.data?.origin ?? null;
  const done = useRef<HTMLButtonElement>(null);
  const editor = useRef<EditorHandle>(null);
  const closing = useRef(false);
  // Starting again opens the editor anew, on what the student was given.
  const [opened, setOpened] = useState({ round: 0, files: given });
  const latest = useRef<ProjectFile[]>([...given]);
  const [tooLarge, setTooLarge] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const { state, changed, keep } = useKeptFiles(onKeep);
  const strings = useMemo(
    () => ({
      title: m.deviceEditorTitle(),
      loading: m.deviceEditorLoading(),
      missing: m.deviceEditorMissing(),
    }),
    [],
  );

  const take = (files: ProjectFile[], began = false) => {
    latest.current = files;
    setTooLarge(projectBytes(files) > MAX_PROJECT_BYTES);
    changed(files, began);
  };
  const close = async () => {
    if (closing.current) return;
    closing.current = true;
    // The editor tells of a change a moment after it; the last is asked for.
    if (!unkept) await editor.current?.flush();
    const safe = await keep();
    closing.current = false;
    if (safe) onClose(latest.current);
    else
      toast.error(
        projectBytes(latest.current) > MAX_PROJECT_BYTES
          ? m.projectTooLarge()
          : m.studioSaveFailed(),
      );
  };

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
                {m.deviceStudioTitle()}
              </DialogPrimitive.Title>
              <p className="truncate text-[13px] leading-[18px] text-muted-foreground">
                <bdi>{title}</bdi>
              </p>
            </div>
            {onKeep ? (
              <SaveStatus state={state} />
            ) : unkept ? (
              <span className="text-[13px] text-muted-foreground max-sm:sr-only">
                {m.deviceStudioReadOnly()}
              </span>
            ) : null}
            {starter ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="max-md:size-10 max-md:px-0"
                onClick={() => setRestarting(true)}
              >
                <RotateCcw aria-hidden />
                <span className="max-md:sr-only">{m.projectRestart()}</span>
              </Button>
            ) : null}
            {action ? (
              <Button
                type="button"
                variant="outline"
                className="max-md:h-10"
                onClick={action.onSelect}
              >
                {action.label}
              </Button>
            ) : null}
            <Button
              ref={done}
              type="button"
              className="max-md:h-10"
              disabled={state === "saving"}
              onClick={() => void close()}
            >
              {m.studioDone()}
            </Button>
          </header>
          {tooLarge ? (
            <p
              role="alert"
              className="flex shrink-0 items-start gap-2 border-b bg-destructive/10 px-3 py-2 text-[13px] leading-[18px] text-destructive"
            >
              <TriangleAlert aria-hidden className="mt-px size-4 shrink-0" />
              {m.projectTooLarge()}
            </p>
          ) : note ? (
            <p className="flex shrink-0 items-start gap-2 border-b bg-muted/50 px-3 py-2 text-[13px] leading-[18px] text-muted-foreground">
              <Info aria-hidden className="mt-px size-4 shrink-0" />
              {note}
            </p>
          ) : null}
          <div className="min-h-0 flex-1">
            {origin ? (
              <EditorFrame
                key={opened.round}
                ref={editor}
                origin={origin}
                files={opened.files}
                language={getLocale()}
                readOnly={unkept}
                onChange={take}
                onBack={() => void close()}
                strings={strings}
              />
            ) : (
              <p className="flex size-full items-center justify-center px-6 text-center text-sm leading-5 text-muted-foreground">
                {host.isPending
                  ? m.deviceEditorLoading()
                  : m.deviceEditorMissing()}
              </p>
            )}
          </div>
          <ConfirmDialog
            open={restarting}
            title={m.projectRestartTitle()}
            body={m.projectRestartBody()}
            confirmLabel={m.projectRestart()}
            onConfirm={() => {
              if (!starter) return;
              take([...starter], true);
              setOpened((now) => ({ round: now.round + 1, files: starter }));
              setRestarting(false);
            }}
            onCancel={() => setRestarting(false)}
          />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
