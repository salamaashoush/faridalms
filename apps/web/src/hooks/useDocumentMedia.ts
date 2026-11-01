import type {
  FilePurpose,
  SpeechLanguage,
  StorageScope,
  UploadDestination,
} from "@faridalms/domain/file";
import type {
  EditorMedia,
  UploadedFile,
  UploadOptions,
} from "@faridalms/editor";

import { ATTACHABLE_EXTENSIONS, mediaTypeFor } from "@faridalms/domain/file";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { toast } from "sonner";

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
import { sendFile } from "~/utils/upload";

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

/**
 * Stores a file as media a document keeps, through the same two-step upload
 * as any attachment, counted against where it goes.
 */
export async function uploadDocumentFile(
  initiate: ReturnType<typeof useServerFn<typeof initiateUpload>>,
  file: File,
  destination: UploadDestination | undefined,
  options: UploadOptions = {},
  purpose: MediaPurpose = "document_media",
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
  await sendFile(
    `/files/${initiated.id}`,
    file,
    initiated.mediaType,
    options,
    initiated.partBytes,
  );
  options.onProgress?.(1);
  warnNearlyFull(initiated.warning);
  return {
    fileId: initiated.id,
    name: initiated.name,
    mime: initiated.mediaType,
    bytes: initiated.sizeBytes,
  };
}

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
  const type = destination?.type;
  const id = destination?.id;
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
        search: async (query: string) =>
          (await search({ data: { q: query } })).pictures,
        credits: m.pictureCredits(),
      },
      upload: (file: File, _kind, options = {}) =>
        uploadDocumentFile(
          initiate,
          file,
          type && id ? { type, id } : undefined,
          options,
          purpose,
        ),
    }),
    [initiate, search, askDraft, draftOf, abilities, type, id, purpose],
  );
}
