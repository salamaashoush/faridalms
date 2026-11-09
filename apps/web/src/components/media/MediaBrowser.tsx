import type { AreaSort, FileKind } from "@faridalms/domain/file";
import type { ActionItem } from "@faridalms/ui/system/action-menu";
import type {
  BatchAction,
  Column,
  DataTableCard,
} from "@faridalms/ui/system/data-table";
import type { IndexToolbarProps } from "@faridalms/ui/system/index-toolbar";

import { pictureCreditSchema } from "@faridalms/domain/commons";
import { FILE_KINDS } from "@faridalms/domain/file";
import { monthLabel } from "@faridalms/domain/media";
import { FileIcon, FileViewer } from "@faridalms/editor/files";
import { Button } from "@faridalms/ui/button";
import { DataTable } from "@faridalms/ui/system/data-table";
import { MediaGrid } from "@faridalms/ui/system/media-grid";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { Segmented } from "@faridalms/ui/system/panel";
import { FileDropZone, UploadQueue } from "@faridalms/ui/system/upload-queue";
import { Value } from "@faridalms/ui/system/value";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Crop,
  Download,
  Eye,
  Focus,
  FolderInput,
  FolderPlus,
  HardDrive,
  History,
  Images,
  LayoutGrid,
  Link2,
  List,
  ListTree,
  Pencil,
  Replace,
  Search,
  Tags,
  Trash2,
  Upload,
  UsersRound,
} from "lucide-react";
import { Suspense, useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { fileStrings } from "~/components/content/strings";
import { usePicturePeople } from "~/components/files/PicturedPeople";
import { VersionsSheet } from "~/components/files/VersionsSheet";
import { inLocale } from "~/hooks/useCurrentUser";
import { uploadDocumentFile, useDocumentMedia } from "~/hooks/useDocumentMedia";
import { useUploadQueue } from "~/hooks/useUploadQueue";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { mediaQuery } from "~/queries/media";
import { initiateUpload } from "~/server/files";
import {
  addToMedia,
  mediaVersions,
  removeMediaFolder,
  replaceMediaItem,
  trashMediaItem,
  trashMediaItems,
} from "~/server/media";
import { formatDate, formatNumber } from "~/utils/datetime";

import type { MediaFolderRow, MediaRow } from "./media-items";

import { CropSheet } from "./CropSheet";
import { FocusSheet } from "./FocusSheet";
import {
  factsOf,
  isPicture,
  itemTitle,
  KIND_LABEL,
  mediaTile,
  thumbnailOf,
} from "./media-items";
import { MediaFolders } from "./MediaFolders";
import { MediaInDocuments } from "./MediaInDocuments";
import {
  DescribeSheet,
  FolderSheet,
  MoveSheet,
  TrashSheet,
  UsesSheet,
} from "./MediaSheets";
import {
  ImportLinkSheet,
  PictureSearchSheet,
  StorageSheet,
  TagItemsSheet,
  TagsSheet,
} from "./MediaTools";

const foundSchema = v.object({
  description: v.string(),
  credit: pictureCreditSchema,
});

/** What a found picture said of itself, kept as text with its upload across a reload. */
function foundOf(kept: string) {
  try {
    const parsed = v.safeParse(foundSchema, JSON.parse(kept));
    return parsed.success ? parsed.output : null;
  } catch {
    return null;
  }
}

export const MEDIA_LAYOUTS = ["grid", "list"] as const;
export type MediaLayout = (typeof MEDIA_LAYOUTS)[number];

/** Where the page looks: what the school keeps, or the uploads in documents it could keep. */
export const MEDIA_SOURCES = ["kept", "documents"] as const;
export type MediaSourceKind = (typeof MEDIA_SOURCES)[number];

/** What the Media page shows, kept in its address. */
export interface MediaPageView {
  source: MediaSourceKind;
  folder: string;
  q: string;
  kinds: FileKind[];
  months: string[];
  uploaders: string[];
  tags: string[];
  sort: AreaSort;
  order: "asc" | "desc";
  page: number;
  layout: MediaLayout;
}

interface UsedProps {
  item: MediaRow;
  onShow: () => void;
}

function Used({ item, onShow }: UsedProps) {
  if (item.uses === 0) return <Value absent={m.filesNotUsed()} />;
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

/** Several items as one zip, which the browser saves. */
const download = (items: MediaRow[]) =>
  window.location.assign(
    `/exports/media?ids=${items.map((item) => item.id).join(",")}`,
  );

const uploaderName = (item: MediaRow) =>
  item.uploadedBy
    ? inLocale(item.uploadedBy.fullNameEn, item.uploadedBy.fullNameAr)
    : "";

function mediaColumns(
  open: (item: MediaRow) => void,
  showUses: (item: MediaRow) => void,
): Column<MediaRow, AreaSort>[] {
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
          <bdi className="truncate">{itemTitle(item)}</bdi>
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
          <Value absent={m.mediaNoDescription()} />
        ),
    },
    {
      id: "tags",
      header: m.mediaTags(),
      cell: (item) =>
        item.tags.length ? (
          <span className="flex flex-wrap gap-1">
            {item.tags.map((tag) => (
              <bdi
                key={tag.id}
                className="rounded-md bg-muted px-1.5 text-[13px] leading-[18px]"
              >
                {tag.name}
              </bdi>
            ))}
          </span>
        ) : (
          <Value absent={m.mediaNoTags()} />
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
        <span className="grid whitespace-nowrap text-muted-foreground">
          <span>{formatDate(item.createdAt)}</span>
          {uploaderName(item) ? <bdi>{uploaderName(item)}</bdi> : null}
        </span>
      ),
    },
  ];
}

function mediaCard(
  showUses: (item: MediaRow) => void,
): DataTableCard<MediaRow> {
  return {
    leading: (item) =>
      thumbnailOf(item) ? (
        <img
          src={thumbnailOf(item) ?? undefined}
          alt=""
          loading="lazy"
          className="size-10 rounded-md object-cover"
          style={{
            objectPosition: mediaTile.position?.(item),
          }}
        />
      ) : (
        <FileIcon
          file={{ name: item.name, mime: item.mediaType }}
          className="size-5 text-muted-foreground"
        />
      ),
    title: (item) => <bdi>{itemTitle(item)}</bdi>,
    fact: (item) => (
      <span className="grid gap-0.5">
        <span>{factsOf(item)}</span>
        <Used item={item} onShow={() => showUses(item)} />
      </span>
    ),
  };
}

export interface MediaBrowserProps {
  view: MediaPageView;
  onView: (change: Partial<MediaPageView>) => void;
}

/**
 * The school's media: folders, a search across all of them by
 * name, title, description or caption, filters by kind, month, uploader
 * and tag, pictures as a grid or everything as a list, and for each item
 * where it is used. Files dropped or pasted on the page upload into the
 * open folder, and an upload a reload cut off is picked up again. Deleting
 * moves an item to a trash kept for 30 days, and an item in use says so
 * first.
 */
export function MediaBrowser({ view, onView }: MediaBrowserProps) {
  const folderId = view.folder || null;
  const data = useSuspenseQuery(
    mediaQuery({
      folderId,
      q: view.q.trim(),
      kinds: view.kinds,
      months: view.months,
      uploaders: view.uploaders,
      tags: view.tags,
      sort: view.sort,
      order: view.order,
      page: view.page,
    }),
  ).data;
  const keeper = data.keeper;
  const queryClient = useQueryClient();
  const media = useDocumentMedia();
  const initiate = useServerFn(initiateUpload);
  const add = useServerFn(addToMedia);
  const trash = useServerFn(trashMediaItem);
  const trashMany = useServerFn(trashMediaItems);
  const replace = useServerFn(replaceMediaItem);
  const fetchVersions = useServerFn(mediaVersions);
  const removeFolder = useServerFn(removeMediaFolder);
  const people = usePicturePeople("website");
  const input = useRef<HTMLInputElement>(null);
  const replacement = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<MediaRow | null>(null);
  const [viewing, setViewing] = useState<MediaRow | null>(null);
  const [describing, setDescribing] = useState<MediaRow | null>(null);
  const [moving, setMoving] = useState<MediaRow[] | null>(null);
  const [tagging, setTagging] = useState<MediaRow[] | null>(null);
  const [cropping, setCropping] = useState<MediaRow | null>(null);
  const [focusing, setFocusing] = useState<MediaRow | null>(null);
  const [usesOf, setUsesOf] = useState<MediaRow | null>(null);
  const [versionsOf, setVersionsOf] = useState<MediaRow | null>(null);
  const [folderSheet, setFolderSheet] = useState<{
    folder: MediaFolderRow | null;
  } | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["media"] });

  const queue = useUploadQueue({
    scope: "media",
    upload: (file, options, keeping) =>
      uploadDocumentFile(
        initiate,
        file,
        undefined,
        options,
        "document_media",
        keeping,
      ),
    place: async (sent, meta) => {
      if (meta.replace) {
        await replace({ data: { id: meta.replace, sourceId: sent.fileId } });
        toast.success(m.filesReplaced());
      } else {
        const added = await add({
          data: {
            ids: [sent.fileId],
            folderId: meta.folderId ?? null,
            found: meta.found ? foundOf(meta.found) : null,
          },
        });
        for (const twin of added.twins)
          toast.info(m.mediaTwin({ name: twin.twinName }));
      }
      await refresh();
    },
  });
  const upload = (files: File[]) => queue.add(files, { folderId });

  const itemActions = (item: MediaRow): ActionItem[] => [
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
    ...(keeper && isPicture(item)
      ? [
          {
            label: m.mediaFocus(),
            icon: Focus,
            onSelect: () => setFocusing(item),
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
          {
            label: m.mediaTagAction(),
            icon: Tags,
            onSelect: () => setTagging([item]),
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
            label: m.filesReplace(),
            icon: Replace,
            onSelect: () => {
              setReplacing(item);
              replacement.current?.click();
            },
          },
          {
            label: m.filesVersions(),
            icon: History,
            onSelect: () => setVersionsOf(item),
          },
          {
            label: m.filesDelete(),
            icon: Trash2,
            destructive: true as const,
            confirm: {
              title: m.filesDeleteTitle({ name: itemTitle(item) }),
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

  const batchActions: BatchAction<MediaRow>[] = [
    { label: m.mediaDownloadZip(), icon: Download, onSelect: download },
    ...(keeper
      ? [
          {
            label: m.mediaTagAction(),
            icon: Tags,
            onSelect: (rows: MediaRow[]) => setTagging(rows),
          },
          {
            label: m.mediaMove(),
            icon: FolderInput,
            onSelect: (rows: MediaRow[]) => setMoving(rows),
          },
          {
            label: m.filesDelete(),
            icon: Trash2,
            destructive: true as const,
            confirm: (rows: MediaRow[]) => {
              const used = rows.filter((row) => row.uses > 0).length;
              return {
                title: m.mediaDeleteMany({
                  count: rows.length,
                  value: formatNumber(rows.length),
                }),
                body:
                  used > 0
                    ? m.mediaDeleteManyUsed({
                        count: used,
                        value: formatNumber(used),
                      })
                    : m.filesDeleteUnused(),
                label: m.filesDelete(),
              };
            },
            onSelect: async (rows: MediaRow[]) => {
              await trashMany({
                data: { ids: rows.map((row) => row.id), trashed: true },
              });
              await refresh();
              toast.success(m.filesDeleted());
            },
          },
        ]
      : []),
  ];

  const folderActions = (folder: MediaFolderRow): ActionItem[] =>
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
      {
        id: "month",
        label: m.mediaAddedIn(),
        options: data.facets.months.map((row) => ({
          value: row.month,
          label: monthLabel(row.month, getLocale()),
          count: row.count,
        })),
        selected: view.months,
        onChange: (months) => onView({ months, page: 1 }),
      },
      {
        id: "uploader",
        label: m.mediaUploadedBy(),
        options: data.facets.uploaders.map((row) => ({
          value: row.id,
          label:
            inLocale(row.fullNameEn, row.fullNameAr) || m.commonNotRecorded(),
          count: row.count,
        })),
        selected: view.uploaders,
        onChange: (uploaders) => onView({ uploaders, page: 1 }),
      },
    ],
    onReset: () =>
      onView({
        q: "",
        kinds: [],
        months: [],
        uploaders: [],
        tags: [],
        page: 1,
      }),
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

  const filtering =
    view.q.trim() !== "" ||
    view.months.length > 0 ||
    view.uploaders.length > 0 ||
    view.tags.length > 0;

  const tagFilter =
    data.facets.tags.length > 0 ? (
      <fieldset className="flex flex-wrap items-center gap-1.5">
        <legend className="sr-only">{m.mediaTagFilter()}</legend>
        <span
          aria-hidden
          className="me-1 text-[13px] leading-[18px] text-muted-foreground"
        >
          {m.mediaTags()}
        </span>
        {data.facets.tags.map((tag) => {
          const on = view.tags.includes(tag.id);
          return (
            <Button
              key={tag.id}
              type="button"
              size="sm"
              variant={on ? "secondary" : "outline"}
              aria-pressed={on}
              className="h-7 rounded-full px-2.5 max-md:h-9"
              onClick={() =>
                onView({
                  tags: on
                    ? view.tags.filter((id) => id !== tag.id)
                    : [...view.tags, tag.id],
                  page: 1,
                })
              }
            >
              <bdi>{tag.name}</bdi>
              <span className="text-muted-foreground tabular-nums">
                {formatNumber(tag.count)}
              </span>
            </Button>
          );
        })}
      </fieldset>
    ) : null;

  const folders = filtering ? null : (
    <MediaFolders
      path={data.path}
      folders={data.children}
      onOpen={(next) => onView({ folder: next ?? "", page: 1 })}
      folderActions={folderActions}
    />
  );

  const leading =
    tagFilter || folders ? (
      <div className="grid gap-3">
        {tagFilter}
        {folders}
      </div>
    ) : null;

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

  const columns = mediaColumns(setViewing, setUsesOf);
  const showsKept = view.source === "kept";

  return (
    <Page width="list">
      <FileDropZone
        onFiles={upload}
        label={
          data.path.at(-1)
            ? m.mediaDropInto({ name: data.path.at(-1)?.name ?? "" })
            : m.mediaDropHere()
        }
        pastePage={showsKept}
        disabled={!showsKept}
        className="grid gap-4"
      >
        <PageHeader
          title={m.navMedia()}
          description={m.mediaHint()}
          action={{
            label: m.filesUpload(),
            icon: Upload,
            onClick: () => input.current?.click(),
          }}
          menu={[
            {
              label: m.mediaImportTitle(),
              icon: Link2,
              onSelect: () => setImporting(true),
            },
            ...(media.pictures
              ? [
                  {
                    label: m.mediaPictureSearch(),
                    icon: Search,
                    onSelect: () => setSearching(true),
                  },
                ]
              : []),
            ...(keeper
              ? [
                  {
                    label: m.mediaFolderNew(),
                    icon: FolderPlus,
                    onSelect: () => setFolderSheet({ folder: null }),
                  },
                  {
                    label: m.mediaTags(),
                    icon: Tags,
                    onSelect: () => setTagsOpen(true),
                  },
                  {
                    label: m.mediaStorage(),
                    icon: HardDrive,
                    onSelect: () => setStorageOpen(true),
                  },
                  {
                    label: m.filesTrash(),
                    icon: Trash2,
                    onSelect: () => setTrashOpen(true),
                  },
                ]
              : []),
          ]}
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
            upload(chosen);
          }}
        />
        <input
          ref={replacement}
          type="file"
          hidden
          onChange={(event) => {
            const [chosen] = event.target.files ?? [];
            event.target.value = "";
            if (chosen && replacing)
              queue.add([chosen], { replace: replacing.id });
          }}
        />
        <UploadQueue
          label={m.filesUploading()}
          items={queue.items}
          onCancel={queue.cancel}
          onRetry={queue.retry}
          onDismiss={queue.dismiss}
        />
        <Segmented
          label={m.mediaSource()}
          value={view.source}
          className="justify-self-start"
          options={[
            { value: "kept", label: m.mediaSourceKept() },
            { value: "documents", label: m.mediaInDocuments() },
          ]}
          onChange={(source) => onView({ source, page: 1 })}
        />
        {!showsKept ? (
          <Suspense fallback={<div aria-busy="true" className="min-h-24" />}>
            <MediaInDocuments
              q={view.q}
              page={view.page}
              folderId={folderId}
              onSearch={(q) => onView({ q, page: 1 })}
              onPage={(page) => onView({ page })}
            />
          </Suspense>
        ) : view.layout === "grid" ? (
          <MediaGrid
            caption={m.mediaTitle()}
            items={data.items.rows}
            tile={mediaTile}
            toolbar={toolbar}
            actions={layoutSwitch}
            leading={leading}
            onOpen={setViewing}
            itemActions={itemActions}
            batchActions={batchActions}
            pagination={pagination}
            empty={empty}
          />
        ) : (
          <div className="grid gap-4">
            {leading}
            <DataTable
              caption={m.mediaTitle()}
              rows={data.items.rows}
              columns={columns}
              rowLabel={itemTitle}
              rowActions={itemActions}
              toolbar={toolbar}
              actions={layoutSwitch}
              sort={{
                value: view.sort,
                direction: view.order,
                onChange: (sort, order) => onView({ sort, order, page: 1 }),
              }}
              batchActions={batchActions}
              card={mediaCard(setUsesOf)}
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
              pdf: viewing.pdf,
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
        {tagging ? (
          <TagItemsSheet
            items={tagging}
            onClose={() => setTagging(null)}
            onTagged={refresh}
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
        {focusing ? (
          <FocusSheet
            key={focusing.id}
            item={focusing}
            onClose={() => setFocusing(null)}
            onSaved={refresh}
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
        {importing ? (
          <ImportLinkSheet
            folderId={folderId}
            onClose={() => setImporting(false)}
            onImported={refresh}
          />
        ) : null}
        <PictureSearchSheet
          open={searching}
          onOpenChange={setSearching}
          onPick={(file, picture) =>
            queue.add([file], {
              folderId,
              found: picture.credit
                ? JSON.stringify({
                    description: picture.alt ?? "",
                    credit: picture.credit,
                  })
                : null,
            })
          }
          onUpload={() => input.current?.click()}
        />
        <UsesSheet
          item={usesOf}
          onOpenChange={(open) => {
            if (!open) setUsesOf(null);
          }}
        />
        <VersionsSheet
          file={
            versionsOf
              ? { id: versionsOf.id, name: itemTitle(versionsOf) }
              : null
          }
          load={(id) => fetchVersions({ data: { id } })}
          restore={(id, versionId) =>
            replace({ data: { id, sourceId: versionId } })
          }
          onOpenChange={(open) => {
            if (!open) setVersionsOf(null);
          }}
          onRestored={refresh}
        />
        <TrashSheet
          open={trashOpen}
          onOpenChange={setTrashOpen}
          onRestored={refresh}
        />
        <TagsSheet
          open={tagsOpen}
          tags={data.facets.tags}
          onOpenChange={setTagsOpen}
          onChanged={refresh}
        />
        <StorageSheet open={storageOpen} onOpenChange={setStorageOpen} />
        {people.sheet}
      </FileDropZone>
    </Page>
  );
}
