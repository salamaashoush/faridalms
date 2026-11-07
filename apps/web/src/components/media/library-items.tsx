import type { FileKind } from "@faridalms/domain/file";
import type { LibraryChoice, LibraryKind } from "@faridalms/editor";
import type { MediaGridTile } from "@faridalms/ui/system/media-grid";

import { FileIcon, fileMeta } from "@faridalms/editor/files";

import type { listLibrary } from "~/server/media-library";

import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

export type LibraryPage = Awaited<ReturnType<typeof listLibrary>>;
export type LibraryRow = LibraryPage["items"]["rows"][number];
export type LibraryFolderRow = LibraryPage["folders"][number];

/** The kinds of file each kind of choice may be. */
export const KINDS_OF: Record<LibraryKind, FileKind[]> = {
  image: ["pictures"],
  media: ["audio", "video"],
  video: ["video"],
  file: [],
};

export const isPicture = (row: LibraryRow) =>
  row.mediaType.toLowerCase().startsWith("image/");

export const factsOf = (row: LibraryRow) =>
  fileMeta(
    { name: row.name, mime: row.mediaType, bytes: row.sizeBytes },
    getLocale(),
  );

/** A library item as a document shows it: the library's words are where a use starts. */
export const choiceOf = (row: LibraryRow): LibraryChoice => ({
  fileId: row.id,
  name: row.name,
  mime: row.mediaType,
  bytes: row.sizeBytes,
  alt: row.description,
  ...(row.credit ? { credit: row.credit } : {}),
});

export const libraryTile: MediaGridTile<LibraryRow> = {
  src: (row) => (isPicture(row) ? `/files/${row.id}` : null),
  icon: (row) => <FileIcon file={{ name: row.name, mime: row.mediaType }} />,
  title: (row) => row.name,
  fact: (row) => row.description || factsOf(row),
};

/** How a record showing a library item is named beside its title. */
export function hostKindLabel(hostType: string): string {
  switch (hostType) {
    case "lesson":
      return m.libraryKindLesson();
    case "assignment":
      return m.libraryKindAssignment();
    case "module_plan":
      return m.libraryKindPlan();
    case "announcement":
      return m.libraryKindAnnouncement();
    case "news":
      return m.libraryKindNews();
    case "site_page":
      return m.sharedUsePage();
    case "calendar_event":
      return m.mediaUseEvent();
    case "shared_block":
      return m.mediaUseShared();
    default:
      return m.mediaUseOther();
  }
}
