import type { ClipboardEvent, DragEvent, ReactNode } from "react";

import { Button } from "../button";
import { cn } from "../cn";
import { RotateCcw, Upload, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { useDesignSystem } from "./provider";

/** Where one file of a queue has got. */
export type UploadQueueState = "waiting" | "sending" | "failed";

export interface UploadQueueItem {
  id: string;
  name: string;
  /** What the file is, such as its kind and size, said beside its name. */
  fact?: string | undefined;
  /** How much has been sent, from 0 to 1. */
  progress: number;
  state: UploadQueueState;
  /** Why a failed file failed, in the reader's language. */
  error?: string | null | undefined;
  /** Whether trying again could help; a file refused for what it is cannot. */
  retryable?: boolean | undefined;
}

export interface UploadQueueProps {
  /** Names the list for screen readers, as "Uploading". */
  label: string;
  items: readonly UploadQueueItem[];
  /** Stops a file on its way; it leaves the queue. */
  onCancel: (id: string) => void;
  /** Sends a failed file again. */
  onRetry?: (id: string) => void;
  /** Takes a failed file off the queue. */
  onDismiss: (id: string) => void;
  className?: string;
}

/**
 * The files on their way somewhere, each with its name, its progress and a
 * way to stop it; one that failed says why, with Try again where that can
 * help and a way to take it off the list. Every place a person uploads
 * shows its files here, so they read alike.
 */
export function UploadQueue({
  label,
  items,
  onCancel,
  onRetry,
  onDismiss,
  className,
}: UploadQueueProps) {
  const { strings, formatNumber } = useDesignSystem();
  if (items.length === 0) return null;
  return (
    <ul aria-label={label} className={cn("grid gap-2", className)}>
      {items.map((item) => {
        const percent = `${formatNumber(Math.round(item.progress * 100))}%`;
        return (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2"
          >
            <span className="grid min-w-0 flex-1 gap-1">
              <span className="flex items-baseline gap-2 text-sm">
                <bdi className="truncate font-medium">{item.name}</bdi>
                {item.fact ? (
                  <span className="shrink-0 text-[13px] leading-[18px] text-muted-foreground">
                    {item.fact}
                  </span>
                ) : null}
              </span>
              {item.state === "failed" ? (
                <span
                  role="alert"
                  className="text-[13px] leading-[18px] text-destructive"
                >
                  {item.error}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <progress
                    aria-label={strings.uploadProgress(item.name, percent)}
                    max={100}
                    value={Math.round(item.progress * 100)}
                    className="block h-1.5 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
                  />
                  <span className="shrink-0 text-[13px] leading-[18px] text-muted-foreground tabular-nums">
                    {item.state === "waiting" ? strings.uploadWaiting : percent}
                  </span>
                </span>
              )}
            </span>
            {item.state === "failed" ? (
              <span className="flex shrink-0 items-center gap-1">
                {item.retryable && onRetry ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="max-md:h-10"
                    onClick={() => onRetry(item.id)}
                  >
                    <RotateCcw aria-hidden />
                    {strings.uploadRetry}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 max-md:size-10"
                  aria-label={strings.uploadDismiss(item.name)}
                  onClick={() => onDismiss(item.id)}
                >
                  <X aria-hidden />
                </Button>
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 max-md:size-10"
                aria-label={strings.uploadCancel(item.name)}
                onClick={() => onCancel(item.id)}
              >
                <X aria-hidden />
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The files a drag carries, if it carries any. */
const carriesFiles = (event: DragEvent) =>
  event.dataTransfer.types.includes("Files");

/** Whether a paste lands in something a person types in, which keeps it. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

const filesOf = (data: DataTransfer | null) =>
  Array.from(data?.files ?? []).filter((file) => file.size > 0);

export interface FileDropZoneProps {
  /** Receives the files dropped or pasted. */
  onFiles: (files: File[]) => void;
  /** What a drop does, said over the zone while files are dragged over it. */
  label?: string | undefined;
  /**
   * Also takes files pasted anywhere on the page while nobody is typing,
   * as a page whose purpose is uploading does; otherwise only pastes into
   * the zone count.
   */
  pastePage?: boolean | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  children: ReactNode;
}

/**
 * Takes files dragged onto it or pasted into it. While files are dragged
 * over it says what a drop will do; text pasted into a field inside it is
 * left to the field.
 */
export function FileDropZone({
  onFiles,
  label,
  pastePage = false,
  disabled = false,
  className,
  children,
}: FileDropZoneProps) {
  const { strings } = useDesignSystem();
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const take = (files: File[]) => {
    if (!disabled && files.length > 0) onFiles(files);
  };
  const pasted = useEffectEvent((event: globalThis.ClipboardEvent) => {
    if (typing(event.target) || event.defaultPrevented) return;
    const files = filesOf(event.clipboardData);
    if (files.length === 0 || disabled) return;
    event.preventDefault();
    onFiles(files);
  });

  useEffect(() => {
    if (!pastePage) return undefined;
    const paste = (event: globalThis.ClipboardEvent) => pasted(event);
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [pastePage]);

  const leave = () => {
    depth.current = 0;
    setOver(false);
  };
  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(event) => {
        if (disabled || !carriesFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(event) => {
        if (disabled || !carriesFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(event) => {
        if (disabled || !carriesFiles(event)) return;
        event.preventDefault();
        leave();
        take(filesOf(event.dataTransfer));
      }}
      onPaste={(event: ClipboardEvent) => {
        if (pastePage || typing(event.target)) return;
        const files = filesOf(event.clipboardData);
        if (files.length === 0) return;
        event.preventDefault();
        take(files);
      }}
    >
      {children}
      {over ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-primary/8 backdrop-blur-[1px]"
        >
          <span className="flex items-center gap-2 rounded-md bg-background px-3 py-1.5 text-sm font-medium text-primary shadow-xs">
            <Upload className="size-4" aria-hidden />
            {label ?? strings.dropFiles}
          </span>
        </div>
      ) : null}
    </div>
  );
}
