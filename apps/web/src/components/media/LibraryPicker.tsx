import type {
  EditorLibrary,
  LibraryChoice,
  LibraryChooseOptions,
  LibraryKind,
} from "@faridalms/editor";
import type { ReactNode } from "react";

import { usesLibrary } from "@faridalms/domain/media-library";
import { Button } from "@faridalms/ui/button";
import { MediaGrid } from "@faridalms/ui/system/media-grid";
import { SheetPanel } from "@faridalms/ui/system/sheet-panel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Images, Upload } from "lucide-react";
import { createContext, useContext, useMemo, useRef, useState } from "react";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { libraryQuery } from "~/queries/media-library";
import { keepInLibrary } from "~/server/media-library";
import { formatNumber } from "~/utils/datetime";

import type { LibraryRow } from "./library-items";

import { choiceOf, KINDS_OF, libraryTile } from "./library-items";
import { LibraryFolders } from "./LibraryFolders";

const Context = createContext<EditorLibrary | null>(null);

/** The school's media library as an editor or a picture field chooses from it; none for those who may not. */
export function useMediaLibrary(): EditorLibrary | undefined {
  return useContext(Context) ?? undefined;
}

const TITLE: Record<LibraryKind, () => string> = {
  image: m.mediaChoosePicture,
  media: m.mediaChooseMedia,
  video: m.mediaChooseVideo,
  file: m.mediaChooseFile,
};

const EMPTY: Record<LibraryKind, () => string> = {
  image: m.mediaEmptyChoose,
  media: m.mediaEmptyChooseMedia,
  video: m.mediaEmptyChooseVideo,
  file: m.mediaEmptyChooseFile,
};

export interface LibraryChooserProps {
  kind: LibraryKind;
  options: LibraryChooseOptions;
  onDone: (chosen: LibraryChoice[] | null) => void;
}

/**
 * The library opened to choose from: its folders, a search across all of
 * them, and the items of the kind asked for, chosen one or several at a
 * time; the device's own files are offered beside it where the asker can
 * take them.
 */
export function LibraryChooser({ kind, options, onDone }: LibraryChooserProps) {
  const [open, setOpen] = useState(true);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [chosen, setChosen] = useState<Map<string, LibraryRow>>(new Map());
  const listed = useQuery(
    libraryQuery({ folderId, q: q.trim(), kinds: KINDS_OF[kind], page }),
  );
  const close = (result: LibraryChoice[] | null) => {
    setOpen(false);
    onDone(result);
  };
  const rows = listed.data?.items.rows ?? [];
  const pick = () =>
    close(chosen.size > 0 ? [...chosen.values()].map(choiceOf) : null);
  return (
    <SheetPanel
      open={open}
      onOpenChange={(next) => {
        if (!next) close(null);
      }}
      title={TITLE[kind]()}
      description={m.mediaChooseHint()}
      footer={
        <>
          {options.upload ? (
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              onClick={() => {
                // The device's chooser opens from this press, before the panel goes.
                options.upload?.();
                close(null);
              }}
            >
              <Upload aria-hidden />
              {m.editorPictureUpload()}
            </Button>
          ) : null}
          <Button
            type="button"
            className="ms-auto max-md:h-10"
            disabled={chosen.size === 0}
            onClick={pick}
          >
            {chosen.size > 1
              ? m.mediaChooseCount({ count: formatNumber(chosen.size) })
              : m.mediaChoose()}
          </Button>
        </>
      }
    >
      {listed.isPending ? (
        <div aria-busy="true" className="min-h-48" />
      ) : (
        <MediaGrid
          caption={m.mediaTitle()}
          items={rows}
          tile={libraryTile}
          toolbar={{
            search: {
              value: q,
              onChange: (next) => {
                setQ(next);
                setPage(1);
              },
              label: m.mediaSearch(),
              placeholder: m.mediaSearch(),
            },
            onReset: () => {
              setQ("");
              setPage(1);
            },
          }}
          leading={
            q.trim() ? null : (
              <LibraryFolders
                path={listed.data?.path ?? []}
                folders={listed.data?.children ?? []}
                onOpen={(next) => {
                  setFolderId(next);
                  setPage(1);
                }}
              />
            )
          }
          selection={{
            selected: new Set(chosen.keys()),
            multiple: options.multiple ?? false,
            onChange: (ids) =>
              setChosen((before) => {
                const next = new Map<string, LibraryRow>();
                for (const id of ids) {
                  const row =
                    before.get(id) ?? rows.find((item) => item.id === id);
                  if (row) next.set(id, row);
                }
                return next;
              }),
          }}
          pagination={
            listed.data
              ? {
                  page: listed.data.items.page,
                  pages: listed.data.items.pages,
                  total: listed.data.items.total,
                  pageSize: listed.data.items.pageSize,
                  onPage: setPage,
                }
              : undefined
          }
          empty={{
            icon: Images,
            title: folderId ? m.mediaFolderEmpty() : EMPTY[kind](),
            description: m.mediaEmptyChooseBody(),
          }}
        />
      )}
    </SheetPanel>
  );
}

interface Choosing {
  key: number;
  kind: LibraryKind;
  options: LibraryChooseOptions;
  resolve: (chosen: LibraryChoice[] | null) => void;
}

export interface MediaLibraryProviderProps {
  children: ReactNode;
}

/**
 * Offers the school's media library to every editor and picture field
 * below it, for those who write; the chooser opens over whatever asked.
 */
export function MediaLibraryProvider({ children }: MediaLibraryProviderProps) {
  const { capabilities } = useCurrentUser();
  const allowed = usesLibrary(capabilities);
  const queryClient = useQueryClient();
  const keep = useServerFn(keepInLibrary);
  const [choosing, setChoosing] = useState<Choosing | null>(null);
  const open = useRef<Choosing | null>(null);
  const library = useMemo<EditorLibrary | null>(
    () =>
      allowed
        ? {
            choose: (kind, options = {}) =>
              new Promise((resolve) => {
                // A chooser still open answers nothing before the next opens.
                open.current?.resolve(null);
                const next = {
                  key: (open.current?.key ?? 0) + 1,
                  kind,
                  options,
                  resolve,
                };
                open.current = next;
                setChoosing(next);
              }),
            keep: async (fileId, words) => {
              await keep({
                data: {
                  fileId,
                  description: words.alt,
                  credit: words.credit ?? null,
                },
              });
              await queryClient.invalidateQueries({
                queryKey: ["media-library"],
              });
            },
          }
        : null,
    [allowed, keep, queryClient],
  );
  return (
    <Context.Provider value={library}>
      {children}
      {choosing ? (
        <LibraryChooser
          key={choosing.key}
          kind={choosing.kind}
          options={choosing.options}
          onDone={(chosen) => {
            choosing.resolve(chosen);
            if (open.current === choosing) open.current = null;
            setChoosing((current) => (current === choosing ? null : current));
          }}
        />
      ) : null}
    </Context.Provider>
  );
}
