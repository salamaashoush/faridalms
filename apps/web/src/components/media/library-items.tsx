import type { FileKind } from "@faridalms/domain/file";
import type { LibraryChoice, LibraryKind } from "@faridalms/editor";
import type { MediaGridTile } from "@faridalms/ui/system/media-grid";

import { placeholderUrl } from "@faridalms/domain/previews";
import { FileIcon, fileMeta } from "@faridalms/editor/files";

import type { listLibrary } from "~/server/media-library";

import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

export type LibraryPage = Awaited<ReturnType<typeof listLibrary>>;
export type LibraryRow = LibraryPage["items"]["rows"][number];
export type LibraryFolderRow = LibraryPage["folders"][number];

/** What each kind of file is called in a filter or a breakdown. */
export const KIND_LABEL: Record<FileKind, () => string> = {
  pictures: m.filesTypePictures,
  documents: m.filesTypeDocuments,
  audio: m.filesTypeAudio,
  video: m.filesTypeVideo,
  other: m.filesTypeOther,
};

/** What an item is called: its title, or its file's name where it has none. */
export const itemTitle = (row: LibraryRow) => row.title || row.name;

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
  ...(row.caption ? { caption: row.caption } : {}),
  ...(row.credit ? { credit: row.credit } : {}),
});

/**
 * What a tile shows of an item: a small size of a picture, or a document's
 * first page as the server drew it; none for anything else.
 */
export function thumbnailOf(row: LibraryRow): string | null {
  if (isPicture(row)) return `/files/${row.id}?w=320`;
  return row.page ? `/files/${row.id}?page=1&w=320` : null;
}

export const libraryTile: MediaGridTile<LibraryRow> = {
  src: thumbnailOf,
  placeholder: (row) => placeholderUrl(row.placeholder),
  position: (row) =>
    row.focus
      ? `${row.focus.x}% ${row.focus.y}%`
      : row.page
        ? "top"
        : undefined,
  icon: (row) => <FileIcon file={{ name: row.name, mime: row.mediaType }} />,
  title: itemTitle,
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
