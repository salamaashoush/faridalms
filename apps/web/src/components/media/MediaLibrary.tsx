import type { AreaSort, FileKind } from "@faridalms/domain/file";
import type { ActionItem } from "@faridalms/ui/system/action-menu";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { IndexToolbarProps } from "@faridalms/ui/system/index-toolbar";

import { FILE_KINDS } from "@faridalms/domain/file";
import { FileIcon, FileViewer } from "@faridalms/editor/files";
import { Button } from "@faridalms/ui/button";
import { DataTable } from "@faridalms/ui/system/data-table";
import { MediaGrid } from "@faridalms/ui/system/media-grid";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { Segmented } from "@faridalms/ui/system/panel";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Crop,
  Download,
  Eye,
  FolderInput,
  FolderPlus,
  Images,
  LayoutGrid,
  List,
  ListTree,
  Pencil,
  Trash2,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { fileStrings } from "~/components/content/strings";
import { usePicturePeople } from "~/components/files/PicturedPeople";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { libraryQuery } from "~/queries/media-library";
import {
  addToLibrary,
  removeLibraryFolder,
  trashLibraryItem,
} from "~/server/media-library";
import { formatDate, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { LibraryFolderRow, LibraryRow } from "./library-items";

import { CropSheet } from "./CropSheet";
import { factsOf, isPicture, libraryTile } from "./library-items";
import { LibraryFolders } from "./LibraryFolders";
import {
  DescribeSheet,
  FolderSheet,
  MoveSheet,
  TrashSheet,
  UsesSheet,
} from "./LibrarySheets";

export const LIBRARY_LAYOUTS = ["grid", "list"] as const;
export type LibraryLayout = (typeof LIBRARY_LAYOUTS)[number];

/** What the library page shows, kept in its address. */
export interface LibraryView {
  folder: string;
  q: string;
  kinds: FileKind[];
  sort: AreaSort;
  order: "asc" | "desc";
  page: number;
  layout: LibraryLayout;
}

const KIND_LABEL: Record<FileKind, () => string> = {
  pictures: m.filesTypePictures,
  documents: m.filesTypeDocuments,
  audio: m.filesTypeAudio,
  video: m.filesTypeVideo,
  other: m.filesTypeOther,
};

interface Pending {
  key: string;
  name: string;
  progress: number;
  error: string | null;
}

interface UsedProps {
  item: LibraryRow;
  onShow: () => void;
}

function Used({ item, onShow }: UsedProps) {
  if (item.uses === 0)
    return <span className="text-muted-foreground">{m.filesNotUsed()}</span>;
  return (
    <button
      type="button"
      onClick={onShow}
      className="rounded-sm text-start font-medium outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      {m.sharedUsedIn({ count: item.uses, value: formatNumber(item.uses) })}
    </button>
  );
}

function libraryColumns(
  open: (item: LibraryRow) => void,
  showUses: (item: LibraryRow) => void,
): Column<LibraryRow, AreaSort>[] {
  return [
    {
      id: "name",
      header: m.filesColumnName(),
      sort: "name",
      primary: true,
      cell: (item) => (
        <button
          type="button"
          onClick={() => open(item)}
          className="inline-flex min-w-0 items-center gap-2 text-start font-medium hover:text-primary hover:underline"
        >
          <FileIcon
            file={{ name: item.name, mime: item.mediaType }}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <bdi className="truncate">{item.name}</bdi>
        </button>
      ),
    },
    {
      id: "description",
      header: m.mediaDescription(),
      cell: (item) =>
        item.description ? (
          <bdi className="line-clamp-2">{item.description}</bdi>
        ) : (
          <span className="text-muted-foreground">
            {m.mediaNoDescription()}
          </span>
        ),
    },
    {
      id: "kind",
      header: m.filesColumnKind(),
      sort: "size",
      cell: (item) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {factsOf(item)}
        </span>
      ),
    },
    {
      id: "used",
      header: m.filesColumnUsedIn(),
      cell: (item) => <Used item={item} onShow={() => showUses(item)} />,
    },
    {
      id: "added",
      header: m.filesColumnAdded(),
      sort: "added",
      cell: (item) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(item.createdAt)}
        </span>
      ),
    },
  ];
}

function libraryCard(
  showUses: (item: LibraryRow) => void,
): DataTableCard<LibraryRow> {
  return {
    leading: (item) =>
      isPicture(item) ? (
        <img
          src={`/files/${item.id}`}
          alt=""
          loading="lazy"
          className="size-10 rounded-md object-cover"
        />
      ) : (
        <FileIcon
          file={{ name: item.name, mime: item.mediaType }}
          className="size-5 text-muted-foreground"
        />
      ),
    title: (item) => <bdi>{item.name}</bdi>,
    fact: (item) => (
      <span className="grid gap-0.5">
        <span>{factsOf(item)}</span>
        <Used item={item} onShow={() => showUses(item)} />
      </span>
    ),
  };
}

export interface MediaLibraryProps {
  view: LibraryView;
  onView: (change: Partial<LibraryView>) => void;
}

/**
 * The school's media library: folders, a search by name or description
 * across all of them, pictures as a grid or everything as a list, and for
 * each item where it is used. Deleting moves an item to a trash kept for
 * 30 days, and an item in use says so first.
 */
export function MediaLibrary({ view, onView }: MediaLibraryProps) {
  const folderId = view.folder || null;
  const data = useSuspenseQuery(
    libraryQuery({
      folderId,
      q: view.q.trim(),
      kinds: view.kinds,
      sort: view.sort,
      order: view.order,
      page: view.page,
    }),
  ).data;
  const keeper = data.keeper;
  const queryClient = useQueryClient();
  const media = useDocumentMedia();
  const add = useServerFn(addToLibrary);
  const trash = useServerFn(trashLibraryItem);
  const removeFolder = useServerFn(removeLibraryFolder);
  const people = usePicturePeople("website");
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [viewing, setViewing] = useState<LibraryRow | null>(null);
  const [describing, setDescribing] = useState<LibraryRow | null>(null);
  const [moving, setMoving] = useState<LibraryRow[] | null>(null);
  const [cropping, setCropping] = useState<LibraryRow | null>(null);
  const [usesOf, setUsesOf] = useState<LibraryRow | null>(null);
  const [folderSheet, setFolderSheet] = useState<{
    folder: LibraryFolderRow | null;
  } | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["media-library"] });

  const upload = async (file: File) => {
    const key = crypto.randomUUID();
    const change = (patch: Partial<Pending>) =>
      setPending((rows) =>
        rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
      );
    setPending((rows) => [
      ...rows,
      { key, name: file.name, progress: 0, error: null },
    ]);
    try {
      const sent = await media.upload(file, "file", {
        onProgress: (progress) => change({ progress }),
      });
      await add({ data: { ids: [sent.fileId], folderId } });
      setPending((rows) => rows.filter((row) => row.key !== key));
      await refresh();
    } catch (error) {
      change({ error: getMessageFromError(error) });
    }
  };

  const itemActions = (item: LibraryRow): ActionItem[] => [
    { label: m.fileOpen(), icon: Eye, onSelect: () => setViewing(item) },
    {
      label: m.editorDownloadFile(),
      icon: Download,
      onSelect: () => window.location.assign(`/files/${item.id}?download`),
    },
    {
      label: m.mediaUses(),
      icon: ListTree,
      onSelect: () => setUsesOf(item),
    },
    ...(isPicture(item)
      ? [
          {
            label: m.mediaCrop(),
            icon: Crop,
            onSelect: () => setCropping(item),
          },
        ]
      : []),
    ...(keeper
      ? [
          {
            label: m.mediaDescribe(),
            icon: Pencil,
            onSelect: () => setDescribing(item),
          },
          ...(isPicture(item)
            ? [
                {
                  label: m.editorPicturePeople(),
                  icon: UsersRound,
                  onSelect: () => people.open(item.id),
                },
              ]
            : []),
          {
            label: m.mediaMove(),
            icon: FolderInput,
            onSelect: () => setMoving([item]),
          },
          {
            label: m.filesDelete(),
            icon: Trash2,
            destructive: true as const,
            confirm: {
              title: m.filesDeleteTitle({ name: item.name }),
              body:
                item.uses > 0
                  ? m.mediaDeleteUsed({
                      count: item.uses,
                      value: formatNumber(item.uses),
                    })
                  : m.filesDeleteUnused(),
              label: m.filesDelete(),
            },
            onSelect: async () => {
              await trash({ data: { id: item.id, trashed: true } });
              await refresh();
              toast.success(m.filesDeleted());
            },
          },
        ]
      : []),
  ];

  const folderActions = (folder: LibraryFolderRow): ActionItem[] =>
    keeper
      ? [
          {
            label: m.mediaFolderRename(),
            icon: Pencil,
            onSelect: () => setFolderSheet({ folder }),
          },
          {
            label: m.mediaFolderRemove(),
            icon: Trash2,
            destructive: true,
            confirm: {
              title: m.mediaFolderRemoveTitle({ name: folder.name }),
              body: m.mediaFolderRemoveBody(),
              label: m.mediaFolderRemove(),
            },
            onSelect: async () => {
              await removeFolder({ data: { id: folder.id } });
              await refresh();
            },
          },
        ]
      : [];

  const toolbar: IndexToolbarProps = {
    search: {
      value: view.q,
      onChange: (q) => onView({ q, page: 1 }),
      label: m.mediaSearch(),
      placeholder: m.mediaSearch(),
    },
    facets: [
      {
        id: "kind",
        label: m.filesType(),
        options: FILE_KINDS.map((kind) => ({
          value: kind,
          label: KIND_LABEL[kind](),
          count: data.kinds[kind] ?? 0,
        })),
        selected: view.kinds,
        onChange: (next) =>
          onView({
            kinds: FILE_KINDS.filter((kind) => next.includes(kind)),
            page: 1,
          }),
      },
    ],
    onReset: () => onView({ q: "", kinds: [], page: 1 }),
  };

  const layoutSwitch = (
    <Segmented
      label={m.mediaLayout()}
      value={view.layout}
      options={[
        {
          value: "grid",
          label: m.mediaLayoutGrid(),
          icon: <LayoutGrid aria-hidden />,
        },
        {
          value: "list",
          label: m.mediaLayoutList(),
          icon: <List aria-hidden />,
        },
      ]}
      onChange={(layout) => onView({ layout })}
    />
  );

  const folders = view.q.trim() ? null : (
    <LibraryFolders
      path={data.path}
      folders={data.children}
      onOpen={(next) => onView({ folder: next ?? "", page: 1 })}
      folderActions={folderActions}
    />
  );

  const pagination =
    data.items.pages > 1
      ? {
          page: data.items.page,
          pages: data.items.pages,
          total: data.items.total,
          pageSize: data.items.pageSize,
          onPage: (page: number) => onView({ page }),
        }
      : undefined;

  const empty = {
    icon: Images,
    title: folderId ? m.mediaFolderEmpty() : m.mediaEmpty(),
    description: m.mediaEmptyBody(),
  };

  const columns = libraryColumns(setViewing, setUsesOf);

  return (
    <>
      <PageHeader
        title={m.mediaTitle()}
        description={m.mediaHint()}
        action={{
          label: m.filesUpload(),
          icon: Upload,
          onClick: () => input.current?.click(),
        }}
        menu={
          keeper
            ? [
                {
                  label: m.mediaFolderNew(),
                  icon: FolderPlus,
                  onSelect: () => setFolderSheet({ folder: null }),
                },
                {
                  label: m.filesTrash(),
                  icon: Trash2,
                  onSelect: () => setTrashOpen(true),
                },
              ]
            : []
        }
      />
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={[
          ...media.accept.image,
          ...media.accept.media,
          ...media.accept.file,
        ].join(",")}
        onChange={(event) => {
          const chosen = [...(event.target.files ?? [])];
          event.target.value = "";
          for (const file of chosen) void upload(file);
        }}
      />
      {pending.length > 0 ? (
        <ul className="mb-4 grid gap-2" aria-live="polite">
          {pending.map((row) => (
            <li
              key={row.key}
              className="grid gap-1.5 rounded-lg border px-4 py-3 text-sm"
            >
              <span className="flex items-center justify-between gap-3">
                <bdi className="truncate">{row.name}</bdi>
                {row.error ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 max-md:size-10"
                    aria-label={m.fileDismissNamed({ name: row.name })}
                    onClick={() =>
                      setPending((rows) =>
                        rows.filter((item) => item.key !== row.key),
                      )
                    }
                  >
                    <X aria-hidden />
                  </Button>
                ) : null}
              </span>
              {row.error ? (
                <span className="text-destructive">{row.error}</span>
              ) : (
                <progress
                  className="h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
                  value={row.progress}
                  max={1}
                  aria-label={m.filesUploadProgress({
                    name: row.name,
                    percent: `${formatNumber(Math.round(row.progress * 100))}%`,
                  })}
                />
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {view.layout === "grid" ? (
        <MediaGrid
          caption={m.mediaTitle()}
          items={data.items.rows}
          tile={libraryTile}
          toolbar={toolbar}
          actions={layoutSwitch}
          leading={folders}
          onOpen={setViewing}
          itemActions={itemActions}
          pagination={pagination}
          empty={empty}
        />
      ) : (
        <div className="grid gap-4">
          {folders}
          <DataTable
            caption={m.mediaTitle()}
            rows={data.items.rows}
            columns={columns}
            rowLabel={(item) => item.name}
            rowActions={itemActions}
            toolbar={toolbar}
            actions={layoutSwitch}
            sort={{
              value: view.sort,
              direction: view.order,
              onChange: (sort, order) => onView({ sort, order, page: 1 }),
            }}
            batchActions={
              keeper
                ? [
                    {
                      label: m.mediaMove(),
                      icon: FolderInput,
                      onSelect: (rows) => setMoving(rows),
                    },
                  ]
                : undefined
            }
            card={libraryCard(setUsesOf)}
            pagination={pagination}
            empty={empty}
          />
        </div>
      )}
      {viewing ? (
        <FileViewer
          file={{
            name: viewing.name,
            mime: viewing.mediaType,
            bytes: viewing.sizeBytes,
          }}
          url={`/files/${viewing.id}`}
          open
          onOpenChange={(open) => {
            if (!open) setViewing(null);
          }}
          strings={fileStrings()}
          locale={getLocale()}
        />
      ) : null}
      {describing ? (
        <DescribeSheet
          key={describing.id}
          item={describing}
          onClose={() => setDescribing(null)}
          onSaved={refresh}
        />
      ) : null}
      {moving ? (
        <MoveSheet
          items={moving}
          folders={data.folders}
          onClose={() => setMoving(null)}
          onMoved={refresh}
        />
      ) : null}
      {cropping ? (
        <CropSheet
          key={cropping.id}
          item={cropping}
          onClose={() => setCropping(null)}
          onCropped={refresh}
        />
      ) : null}
      {folderSheet ? (
        <FolderSheet
          folder={folderSheet.folder}
          parentId={folderId}
          onClose={() => setFolderSheet(null)}
          onSaved={refresh}
        />
      ) : null}
      <UsesSheet
        item={usesOf}
        onOpenChange={(open) => {
          if (!open) setUsesOf(null);
        }}
      />
      <TrashSheet
        open={trashOpen}
        onOpenChange={setTrashOpen}
        onRestored={refresh}
      />
      {people.sheet}
    </>
  );
}
