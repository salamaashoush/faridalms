import type { ActionItem } from "@faridalms/ui/system/action-menu";

import { ActionMenu } from "@faridalms/ui/system/action-menu";
import { ChevronRight, Folder } from "lucide-react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import type { LibraryFolderRow } from "./library-items";

export interface LibraryFoldersProps {
  /** The folders from the top down to the open one; none at the top. */
  path: LibraryFolderRow[];
  /** The open folder's own folders. */
  folders: LibraryFolderRow[];
  onOpen: (folderId: string | null) => void;
  folderActions?: (folder: LibraryFolderRow) => ActionItem[];
}

/**
 * Where in the library one is, and the folders of the open folder: each
 * step back up and each folder opens on a press.
 */
export function LibraryFolders({
  path,
  folders,
  onOpen,
  folderActions,
}: LibraryFoldersProps) {
  return (
    <div className="grid gap-3">
      {path.length > 0 ? (
        <nav aria-label={m.mediaFolderPath()}>
          <ol className="flex flex-wrap items-center gap-1 text-sm leading-5">
            <li>
              <button
                type="button"
                onClick={() => onOpen(null)}
                className="rounded-sm font-medium text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 max-md:min-h-10"
              >
                {m.mediaTop()}
              </button>
            </li>
            {path.map((folder, at) => (
              <li key={folder.id} className="flex items-center gap-1">
                <ChevronRight
                  aria-hidden
                  className="size-3.5 text-muted-foreground rtl:-scale-x-100"
                />
                {at === path.length - 1 ? (
                  <span aria-current="page" className="font-medium">
                    <bdi>{folder.name}</bdi>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpen(folder.id)}
                    className="rounded-sm font-medium text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 max-md:min-h-10"
                  >
                    <bdi>{folder.name}</bdi>
                  </button>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {folders.length > 0 ? (
        <ul
          aria-label={m.mediaFolders()}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          {folders.map((folder) => {
            const actions = folderActions?.(folder) ?? [];
            return (
              <li
                key={folder.id}
                className="flex items-center gap-1 rounded-lg border bg-card pe-1"
              >
                <button
                  type="button"
                  onClick={() => onOpen(folder.id)}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <Folder
                    aria-hidden
                    className="size-5 shrink-0 text-muted-foreground"
                  />
                  <span className="grid min-w-0">
                    <bdi className="truncate text-sm leading-5 font-medium">
                      {folder.name}
                    </bdi>
                    <span className="text-[13px] leading-[18px] text-muted-foreground">
                      {m.mediaFolderItems({
                        count: folder.items,
                        value: formatNumber(folder.items),
                      })}
                    </span>
                  </span>
                </button>
                {actions.length > 0 ? (
                  <ActionMenu
                    label={m.mediaFolderActions({ name: folder.name })}
                    actions={actions}
                    className="max-md:size-10"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
