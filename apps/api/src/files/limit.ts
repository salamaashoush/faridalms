import type { SchoolEntitlements } from "@faridalms/domain/plans";

import { isDocumentVideo, MAX_VIDEO_BYTES } from "@faridalms/domain/file";
import { availableModules } from "@faridalms/domain/plans";

/**
 * The most an upload may weigh here. A video a document holds goes up in
 * parts and has its own, larger limit; every other file keeps to the limit
 * one request may carry.
 */
export function uploadLimit(
  context: {
    maxUploadBytes: number;
    maxVideoBytes?: number;
    school: { entitlements: SchoolEntitlements };
  },
  file: { purpose: string; mediaType: string },
): number {
  return isDocumentVideo(file.purpose, file.mediaType) &&
    hasVideo(context.school.entitlements)
    ? Math.max(context.maxUploadBytes, context.maxVideoBytes ?? MAX_VIDEO_BYTES)
    : context.maxUploadBytes;
}

/**
 * Whether a school streams its videos and takes them at the video
 * allowance; without the module a video plays as it was uploaded.
 */
export const hasVideo = (entitlements: SchoolEntitlements) =>
  availableModules(entitlements).includes("video");
