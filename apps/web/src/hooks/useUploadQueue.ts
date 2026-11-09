import type { UploadedFile, UploadOptions } from "@faridalms/editor";
import type { UploadQueueItem } from "@faridalms/ui/system/upload-queue";

import { fileMeta } from "@faridalms/editor/files";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { KeptUpload } from "~/utils/upload-store";

import { getLocale } from "~/i18n/runtime";
import { getMessageFromError } from "~/utils/error";
import { forgetUpload, uploadsIn } from "~/utils/upload-store";

import type { Keeping } from "./useDocumentMedia";

import { keptFile, resumeUpload } from "./useDocumentMedia";

/** What a place says about each file it is given, kept with it across a reload. */
export type UploadMeta = Record<string, string | null>;

interface Queued {
  id: string;
  file: File;
  meta: UploadMeta;
  progress: number;
  state: UploadQueueItem["state"];
  error: string | null;
  retryable: boolean;
  controller: AbortController;
  /** An upload begun before a reload, picked up rather than begun again. */
  kept?: KeptUpload | undefined;
}

export interface UploadQueueConfig {
  /**
   * Where the queue's uploads are kept for a reload to pick up, as
   * `media`; none keeps nothing.
   */
  scope: string | null;
  /** Sends one file, keeping it under `keeping` while it is on its way. */
  upload: (
    file: File,
    options: UploadOptions,
    keeping: Keeping | undefined,
  ) => Promise<UploadedFile>;
  /** Puts an uploaded file where it was meant to go. */
  place: (uploaded: UploadedFile, meta: UploadMeta) => Promise<void>;
  /** A refusal known before anything is sent, as the server's code. */
  precheck?: (file: File) => string | null;
}

/** Failures a second try may get past; a refusal of the file itself will not. */
const PASSING = new Set([
  "file.failed",
  "file.scan_unavailable",
  "file.not_pending",
  "file.part_missing",
  "file.gone",
]);

const codeOf = (error: unknown) =>
  error instanceof Error ? error.message : "";

/**
 * One queue of uploads for a place that takes files: each is sent in turn
 * with its progress, can be stopped, says why it failed and may be tried
 * again, and is put where it was meant to go once in. With a scope, the
 * browser keeps each until it is in, and the queue picks up what a reload
 * interrupted when the place opens again.
 */
export function useUploadQueue(config: UploadQueueConfig) {
  const [queue, setQueue] = useState<Queued[]>([]);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const patch = (id: string, change: Partial<Queued>) =>
    setQueue((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...change } : row)),
    );
  const drop = (id: string) =>
    setQueue((rows) => rows.filter((row) => row.id !== id));

  // Sending outlives the render that queued it, so it reads the place's
  // latest wishes rather than those of the moment it began.
  const latest = useRef(config);
  useEffect(() => {
    latest.current = config;
  });

  const send = async (item: Queued) => {
    const place = latest.current;
    const stopped = () => item.controller.signal.aborted;
    if (stopped()) {
      if (item.kept) await forgetUpload(item.kept.id);
      return;
    }
    const early = place.precheck?.(item.file);
    if (early) {
      patch(item.id, {
        state: "failed",
        error: getMessageFromError(new Error(early)),
        retryable: false,
      });
      return;
    }
    patch(item.id, { state: "sending" });
    const options: UploadOptions = {
      signal: item.controller.signal,
      onProgress: (progress) => patch(item.id, { progress }),
    };
    try {
      const uploaded = item.kept
        ? await resumeUpload(item.kept, options)
        : await place.upload(
            item.file,
            options,
            place.scope ? { scope: place.scope, meta: item.meta } : undefined,
          );
      // Kept until placed, so a reload in between still places it; a
      // place that refuses it lets it go.
      try {
        await place.place(uploaded, item.meta);
      } finally {
        await forgetUpload(uploaded.fileId);
      }
      drop(item.id);
    } catch (error) {
      if (stopped()) return;
      const code = codeOf(error);
      // Another tab is sending it, or the server let it go long ago.
      if (item.kept && (code === "file.elsewhere" || code === "file.gone")) {
        drop(item.id);
        return;
      }
      patch(item.id, {
        state: "failed",
        error: getMessageFromError(error),
        retryable: PASSING.has(code),
        kept: undefined,
      });
    }
  };

  const enqueue = (items: Queued[]) => {
    setQueue((rows) => [...rows, ...items]);
    for (const item of items)
      chain.current = chain.current.then(() => send(item));
  };

  const pickUp = useEffectEvent((kept: KeptUpload[]) =>
    enqueue(
      kept.map((upload) => ({
        id: upload.id,
        file: keptFile(upload),
        meta: upload.meta,
        progress: 0,
        state: "waiting",
        error: null,
        retryable: true,
        controller: new AbortController(),
        kept: upload,
      })),
    ),
  );

  const scope = config.scope;
  useEffect(() => {
    if (!scope) return undefined;
    let open = true;
    void uploadsIn(scope).then((kept) => {
      if (open && kept.length > 0) pickUp(kept);
    });
    return () => {
      open = false;
    };
  }, [scope]);

  const busy = queue.some((item) => item.state !== "failed");
  useEffect(() => {
    if (!busy) return undefined;
    const leave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [busy]);

  const locale = getLocale();
  const items: UploadQueueItem[] = queue.map((item) => ({
    id: item.id,
    name: item.file.name,
    fact: fileMeta(
      { name: item.file.name, mime: item.file.type, bytes: item.file.size },
      locale,
    ),
    progress: item.progress,
    state: item.state,
    error: item.error,
    retryable: item.retryable,
  }));

  return {
    items,
    busy,
    /** Sends files here, saying of each what the place needs to know. */
    add: (files: File[], meta: UploadMeta = {}) =>
      enqueue(
        files.map((file) => ({
          id: crypto.randomUUID(),
          file,
          meta,
          progress: 0,
          state: "waiting",
          error: null,
          retryable: false,
          controller: new AbortController(),
        })),
      ),
    cancel: (id: string) => {
      const item = queue.find((row) => row.id === id);
      item?.controller.abort();
      drop(id);
    },
    retry: (id: string) => {
      const item = queue.find((row) => row.id === id);
      if (!item) return;
      const again: Queued = {
        ...item,
        progress: 0,
        state: "waiting",
        error: null,
        controller: new AbortController(),
      };
      setQueue((rows) => rows.map((row) => (row.id === id ? again : row)));
      chain.current = chain.current.then(() => send(again));
    },
    dismiss: drop,
  };
}
