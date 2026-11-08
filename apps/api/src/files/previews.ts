import type { Cell, CellTransaction } from "@faridalms/database/context";
import type { StoredFile } from "@faridalms/database/stores/files";
import type { StoredPreview } from "@faridalms/database/stores/previews";
import type { PreviewSize } from "@faridalms/domain/previews";

import { readyKey } from "@faridalms/database/stores/files";
import {
  bytesRewritten,
  previewFolder,
  queuePreview,
  unpreviewedFiles,
} from "@faridalms/database/stores/previews";
import {
  acceptedFormats,
  chooseSize,
  isCleanablePicture,
  PREVIEWED_TYPE_PATTERNS,
  previewKindOf,
  UNPREVIEWED_PURPOSES,
} from "@faridalms/domain/previews";

import type { FileStore } from "./store";

import { cleanPicture } from "./ingest";

/**
 * Asks for a file's previews once its bytes are ready, and records what a
 * picture weighs once its metadata is gone. Files sealed at rest get none.
 */
export async function previewReadyFile(
  tx: CellTransaction,
  tenantId: string,
  file: StoredFile,
  kept: { sizeBytes: number; sha256: string; keyVersion: number | null },
): Promise<void> {
  if (kept.keyVersion !== null) return;
  const storageKey = readyKey(tenantId, file.id);
  if (kept.sizeBytes !== file.sizeBytes)
    await bytesRewritten(tx, {
      tenantId,
      storageKey,
      sizeBytes: kept.sizeBytes,
      sha256: kept.sha256,
    });
  const kind = previewKindOf(file.purpose, file.mediaType);
  if (kind)
    await queuePreview(tx, {
      tenantId,
      storageKey,
      mediaType: file.mediaType,
      kind,
    });
}

/**
 * Files stored before previews were made on upload: each picture's
 * location and camera records are removed in place, unless a handed-in
 * attempt holds it, and every file's previews asked for. Runs in the sweep,
 * a few files a pass.
 */
export async function backfillPreviews(
  cell: Cell,
  store: FileStore,
  tenantId: string,
  limit: number,
): Promise<number> {
  const work = () => ({
    tenantId,
    requestId: crypto.randomUUID(),
    actor: { kind: "system" as const },
  });
  const waiting = await cell.withWorker(work(), "read", (tx) =>
    unpreviewedFiles(tx, tenantId, {
      mediaTypes: PREVIEWED_TYPE_PATTERNS,
      unshown: UNPREVIEWED_PURPOSES,
      limit,
    }),
  );
  for (const file of waiting) {
    const cleaned =
      !file.frozen && isCleanablePicture(file.mediaType)
        ? await cleanPicture(store, file.storageKey, file.mediaType)
        : null;
    const kind = previewKindOf(file.purpose, file.mediaType);
    await cell.withWorker(work(), "write", async (tx) => {
      if (cleaned)
        await bytesRewritten(tx, {
          tenantId,
          storageKey: file.storageKey,
          ...cleaned,
        });
      if (kind)
        await queuePreview(tx, {
          tenantId,
          storageKey: file.storageKey,
          mediaType: file.mediaType,
          kind,
        });
    });
  }
  return waiting.length;
}

/** What a reader may ask of a file instead of its bytes as uploaded. */
export interface PreviewAsk {
  /** The width a picture is wanted at. */
  width: number | null;
  /** The first page of a document, as a picture. */
  page: boolean;
  /** An office file converted to PDF. */
  pdf: boolean;
}

export function previewAsk(url: URL): PreviewAsk {
  const width = Number(url.searchParams.get("w"));
  return {
    width:
      Number.isInteger(width) && width > 0 && width <= 10_000 ? width : null,
    page: url.searchParams.get("page") === "1",
    pdf: url.searchParams.get("as") === "pdf",
  };
}

/** A stored object to send in place of the upload, and how to name it. */
export interface PreviewObject {
  storageKey: string;
  mediaType: string;
  sizeBytes: number;
  name: string;
}

const stem = (name: string) => name.replace(/\.[A-Za-z0-9]{1,10}$/, "");

function madeObject(
  tenantId: string,
  preview: StoredPreview,
  size: PreviewSize,
  name: string,
): PreviewObject {
  const extension = size.mediaType === "image/avif" ? "avif" : "webp";
  return {
    storageKey: `${previewFolder(tenantId, preview.id)}/${size.name}`,
    mediaType: size.mediaType,
    sizeBytes: size.bytes,
    name: `${stem(name)}.${extension}`,
  };
}

/**
 * What to send for what a reader asked: a size of a picture in the best
 * format the browser takes, a document's first page, or an office file as
 * PDF. Null sends the upload itself, as it is sent with no previews yet; a
 * page or a PDF there is none of answers "missing".
 */
export function previewObject(
  tenantId: string,
  file: { name: string },
  preview: StoredPreview | undefined,
  ask: PreviewAsk,
  accept: string | null,
): PreviewObject | null | "missing" {
  const ready = preview?.state === "ready" ? preview : undefined;
  if (ask.pdf) {
    if (!ready?.documentBytes) return "missing";
    return {
      storageKey: `${previewFolder(tenantId, ready.id)}/document.pdf`,
      mediaType: "application/pdf",
      sizeBytes: ready.documentBytes,
      name: `${stem(file.name)}.pdf`,
    };
  }
  if (ask.page) {
    const pages = (ready?.sizes ?? []).filter((size) =>
      size.name.startsWith("page1-"),
    );
    const size =
      chooseSize(pages, ask.width ?? 640, ["image/webp"], "page1-") ??
      pages.toSorted((a, b) => b.width - a.width)[0];
    return ready && size
      ? madeObject(tenantId, ready, size, file.name)
      : "missing";
  }
  if (!ready || ready.kind !== "picture" || ask.width === null) return null;
  const size = chooseSize(ready.sizes, ask.width, acceptedFormats(accept));
  return size ? madeObject(tenantId, ready, size, file.name) : null;
}

/** What a reader shows of a file beyond its name and weight. */
export interface PreviewFacts {
  width?: number;
  height?: number;
  placeholder?: string;
  durationMs?: number;
  waveform?: number[];
  /** Its first page can be shown as a picture. */
  page?: boolean;
  /** It can be read as a PDF. */
  pdf?: boolean;
}

export function previewFacts(preview: StoredPreview | undefined): PreviewFacts {
  if (preview?.state !== "ready") return {};
  const facts: PreviewFacts = {};
  if (preview.kind === "picture") {
    if (preview.width) facts.width = preview.width;
    if (preview.height) facts.height = preview.height;
  }
  if (preview.placeholder && preview.kind === "picture")
    facts.placeholder = preview.placeholder;
  if (preview.durationMs) facts.durationMs = preview.durationMs;
  if (preview.waveform) facts.waveform = preview.waveform;
  if (preview.sizes.some((size) => size.name.startsWith("page1-")))
    facts.page = true;
  if (preview.documentBytes) facts.pdf = true;
  return facts;
}
