import type { EditorMedia } from "@faridalms/editor";

import { mediaTypeFor } from "@faridalms/domain/file";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";

import { initiateUpload } from "~/server/files";

const IMAGE = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * Lets a document editor embed pictures and files: each goes through the
 * same two-step upload as any attachment, as media the document keeps.
 */
export function useDocumentMedia(): EditorMedia {
  const initiate = useServerFn(initiateUpload);
  return useMemo(
    () => ({
      accept: {
        image: IMAGE,
        file: ["application/pdf", "text/plain"],
        media: ["audio/mpeg", "video/mp4"],
        captions: ["text/vtt"],
      },
      url: (fileId: string) => `/files/${fileId}`,
      upload: async (file: File) => {
        const initiated = await initiate({
          data: {
            purpose: "document_media",
            name: file.name,
            mediaType: file.type || mediaTypeFor(file.name) || "",
            sizeBytes: file.size,
          },
        });
        const response = await fetch(`/files/${initiated.id}`, {
          method: "PUT",
          headers: { "content-type": initiated.mediaType },
          body: file,
        });
        if (!response.ok) throw new Error("upload failed");
        return {
          fileId: initiated.id,
          name: initiated.name,
          mime: initiated.mediaType,
          bytes: initiated.sizeBytes,
        };
      },
    }),
    [initiate],
  );
}
