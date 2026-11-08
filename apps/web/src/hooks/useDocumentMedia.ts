import type {
  FilePurpose,
  SpeechLanguage,
  StorageScope,
  UploadDestination,
} from "@faridalms/domain/file";
import type {
  EditorMedia,
  UnfinishedUpload,
  UploadedFile,
  UploadKind,
  UploadOptions,
} from "@faridalms/editor";

import { ATTACHABLE_EXTENSIONS, mediaTypeFor } from "@faridalms/domain/file";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { toast } from "sonner";

import type { KeptUpload } from "~/utils/upload-store";

import { useMediaLibrary } from "~/components/media/LibraryPicker";
import { fileSizeLabel } from "~/components/system/FileList";
import * as m from "~/i18n/messages";
import {
  draftCaptions,
  getCaptionDraft,
  getFileAbilities,
  initiateUpload,
} from "~/server/files";
import { searchPictures } from "~/server/library";
import { formatNumber } from "~/utils/datetime";
import { sendFile, uploadState } from "~/utils/upload";
import {
  forgetUpload,
  keepUpload,
  uploadsIn,
  whileHolding,
} from "~/utils/upload-store";

const NEARLY_FULL: Record<
  StorageScope,
  (values: { used: string; limit: string; percent: string }) => string
> = {
  school: m.fileNearlyFullSchool,
  class: m.fileNearlyFullClass,
  module: m.fileNearlyFullModule,
  person: m.fileNearlyFullPerson,
};

/** Says when an upload has taken the storage it counts against past 80%. */
export function warnNearlyFull(
  warning: {
    scope: StorageScope;
    usedBytes: number;
    limitBytes: number;
  } | null,
) {
  if (!warning) return;
  toast.warning(
    NEARLY_FULL[warning.scope]({
      used: fileSizeLabel(warning.usedBytes),
      limit: fileSizeLabel(warning.limitBytes),
      percent: `${formatNumber(Math.min(100, Math.round((warning.usedBytes / warning.limitBytes) * 100)))}%`,
    }),
  );
}

const IMAGE = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * What a document's files are uploaded as: media the document keeps, or a
 * message's attachments, which only its conversation reads.
 */
type MediaPurpose = Extract<
  FilePurpose,
  "document_media" | "message_attachment"
>;

/** Where an upload is kept for a reload to pick up, and what to do with it then. */
export interface Keeping {
  scope: string;
  meta?: Record<string, string | null>;
}

/** Only a dropped connection leaves an upload worth picking up later. */
const interrupted = (error: unknown) =>
  error instanceof Error && error.message === "file.failed";

/**
 * Stores a file as media a document keeps, through the same two-step upload
 * as any attachment, counted against where it goes. Kept, it is held in the
 * browser until the caller has put it where it goes and forgets it, so a
 * reload before then picks it up (`resumeUpload`); a refusal, a cancel or
 * a dropped connection lets it go.
 */
export async function uploadDocumentFile(
  initiate: ReturnType<typeof useServerFn<typeof initiateUpload>>,
  file: File,
  destination: UploadDestination | undefined,
  options: UploadOptions = {},
  purpose: MediaPurpose = "document_media",
  keeping?: Keeping,
): Promise<UploadedFile> {
  let initiated: Awaited<ReturnType<typeof initiate>>;
  try {
    initiated = await initiate({
      data: {
        purpose,
        name: file.name,
        mediaType: file.type || mediaTypeFor(file.name) || "",
        sizeBytes: file.size,
        destination,
        trim: options.trim,
      },
    });
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message.startsWith("file.")
        ? error.message
        : "file.failed",
      { cause: error },
    );
  }
  if (keeping)
    await keepUpload({
      id: initiated.id,
      scope: keeping.scope,
      file,
      name: initiated.name,
      mediaType: initiated.mediaType,
      sizeBytes: initiated.sizeBytes,
      partBytes: initiated.partBytes,
      meta: keeping.meta ?? {},
      startedAt: Date.now(),
    });
  try {
    const sent = await whileHolding(initiated.id, async () => {
      await sendFile(
        `/files/${initiated.id}`,
        file,
        initiated.mediaType,
        options,
        initiated.partBytes,
      );
      return true;
    });
    if (!sent) throw new Error("file.elsewhere");
  } catch (error) {
    if (keeping) await forgetUpload(initiated.id);
    throw error;
  }
  options.onProgress?.(1);
  warnNearlyFull(initiated.warning);
  if (initiated.videoHoursReached) toast.info(m.fileVideoHoursReached());
  return {
    fileId: initiated.id,
    name: initiated.name,
    mime: initiated.mediaType,
    bytes: initiated.sizeBytes,
  };
}

/**
 * Finishes an upload begun before a reload: asks the server which parts it
 * holds and sends the rest, or nothing when it is already in. One another
 * tab is sending is left to it (`file.elsewhere`), and one the server gave
 * up on is let go (`file.gone`); a dropped connection keeps it for the
 * next try. The caller forgets it once it is placed.
 */
export async function resumeUpload(
  kept: KeptUpload,
  options: UploadOptions = {},
): Promise<UploadedFile> {
  const url = `/files/${kept.id}`;
  let sent: true | null;
  try {
    sent = await whileHolding(kept.id, async () => {
      const state = await uploadState(url);
      if (state.state === "gone") throw new Error("file.gone");
      if (state.state === "initiated")
        await sendFile(
          url,
          kept.file,
          kept.mediaType,
          options,
          kept.partBytes,
          new Set(state.parts),
        );
      return true as const;
    });
  } catch (error) {
    if (!interrupted(error)) await forgetUpload(kept.id);
    throw error;
  }
  if (sent === null) throw new Error("file.elsewhere");
  options.onProgress?.(1);
  return {
    fileId: kept.id,
    name: kept.name,
    mime: kept.mediaType,
    bytes: kept.sizeBytes,
  };
}

/** A kept upload as the browser's own file again, with its name and type. */
export const keptFile = (kept: KeptUpload) =>
  kept.file instanceof File
    ? kept.file
    : new File([kept.file], kept.name, { type: kept.mediaType });

/** The kinds of block an editor's kept upload may land as. */
const KINDS: readonly UploadKind[] = [
  "image",
  "file",
  "media",
  "captions",
  "diagram",
  "scene",
];

/**
 * Uploads a page's editors already offered for picking up, so two editors
 * on one page never both take the same file.
 */
const offered = new Set<string>();

/**
 * Lets a document editor embed pictures, sound, video and any file a school
 * may exchange: each goes through the same two-step upload as any
 * attachment, as media the document keeps. Naming where the files go lets
 * the server check the storage cap they count against. A message's files
 * are its attachments, which anyone writing in the conversation may add;
 * recordings in them are kept as sent, so they are neither cut nor captioned.
 */
export function useDocumentMedia(
  destination?: UploadDestination,
  purpose: MediaPurpose = "document_media",
): EditorMedia {
  const initiate = useServerFn(initiateUpload);
  const search = useServerFn(searchPictures);
  const askDraft = useServerFn(draftCaptions);
  const draftOf = useServerFn(getCaptionDraft);
  const abilities = useServerFn(getFileAbilities);
  const library = useMediaLibrary();
  const type = destination?.type;
  const id = destination?.id;
  // An editor's uploads are picked up on the page that began them.
  const scope =
    typeof window === "undefined"
      ? null
      : `editor:${window.location.pathname}${window.location.search}`;
  return useMemo(
    () => ({
      accept: {
        image: IMAGE,
        file: ATTACHABLE_EXTENSIONS.map((extension) => `.${extension}`),
        media: [
          "audio/mpeg",
          "audio/mp4",
          "audio/wav",
          "audio/webm",
          "video/mp4",
          "video/webm",
        ],
        captions: ["text/vtt"],
      },
      url: (fileId: string) => `/files/${fileId}`,
      ...(purpose === "document_media"
        ? {
            ...(library ? { library } : {}),
            canTrim: async () => (await abilities()).trim,
            captions: {
              draft: async (fileId: string, language: SpeechLanguage) => {
                await askDraft({ data: { fileId, language } });
              },
              status: (fileId: string) => draftOf({ data: { fileId } }),
            },
          }
        : {}),
      pictures: {
        search: async (query: string, style = "colour") =>
          (await search({ data: { q: query, style } })).pictures,
        credits: m.pictureCredits(),
      },
      // The editor places a file as soon as it is in, so it is let go then.
      upload: async (file: File, kind, options = {}) => {
        const uploaded = await uploadDocumentFile(
          initiate,
          file,
          type && id ? { type, id } : undefined,
          options,
          purpose,
          scope ? { scope, meta: { kind } } : undefined,
        );
        await forgetUpload(uploaded.fileId);
        return uploaded;
      },
      ...(scope
        ? {
            unfinished: async (): Promise<UnfinishedUpload[]> => {
              const kept = (await uploadsIn(scope)).filter(
                (upload) => !offered.has(upload.id),
              );
              for (const upload of kept) offered.add(upload.id);
              return kept.map((upload) => ({
                id: upload.id,
                file: keptFile(upload),
                kind: KINDS.find((kind) => kind === upload.meta.kind) ?? "file",
                resume: async (options) => {
                  const uploaded = await resumeUpload(upload, options);
                  await forgetUpload(upload.id);
                  return uploaded;
                },
                discard: () => forgetUpload(upload.id),
              }));
            },
          }
        : {}),
    }),
    [
      initiate,
      search,
      askDraft,
      draftOf,
      abilities,
      library,
      type,
      id,
      purpose,
      scope,
    ],
  );
}
