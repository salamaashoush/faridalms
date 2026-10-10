import { isDocumentVideo, MAX_VIDEO_BYTES } from "@faridalms/domain/file";

/**
 * The most an upload may weigh here. A video a document holds goes up in
 * parts and has its own, larger limit; every other file keeps to the limit
 * one request may carry.
 */
export function uploadLimit(
  context: { maxUploadBytes: number; maxVideoBytes?: number },
  file: { purpose: string; mediaType: string },
): number {
  return isDocumentVideo(file.purpose, file.mediaType)
    ? Math.max(context.maxUploadBytes, context.maxVideoBytes ?? MAX_VIDEO_BYTES)
    : context.maxUploadBytes;
}
