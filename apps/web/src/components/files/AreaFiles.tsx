import type { FileArea, FileKind } from "@faridalms/domain/file";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";

import { FILE_KINDS, fileFamily } from "@faridalms/domain/file";
import { useRefreshFileFacts } from "@faridalms/editor/file-facts";
import { FileIcon, fileMeta, FileViewer } from "@faridalms/editor/files";
import { Button } from "@faridalms/ui/button";
import { DataTable } from "@faridalms/ui/system/data-table";
import { TextField } from "@faridalms/ui/system/form-field";
import { RecordEmpty, RecordList } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { SheetPanel } from "@faridalms/ui/system/sheet-panel";
import { FileDropZone, UploadQueue } from "@faridalms/ui/system/upload-queue";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Download,
  Eye,
  FolderOpen,
  History,
  Pencil,
  Replace,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { fileStrings } from "~/components/content/strings";
import { UsageBar } from "~/components/files/UsageBar";
import { VersionsSheet } from "~/components/files/VersionsSheet";
import { uploadDocumentFile, useDocumentMedia } from "~/hooks/useDocumentMedia";
import { useUploadQueue } from "~/hooks/useUploadQueue";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { areaFilesQuery } from "~/queries/files";
import {
  addToArea,
  getFileVersions,
  initiateUpload,
  renameInArea,
  replaceInArea,
  trashInArea,
} from "~/server/files";
import { formatDate, formatList } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type AreaFile = Awaited<
  ReturnType<NonNullable<ReturnType<typeof areaFilesQuery>["queryFn"]>>
>["files"]["rows"][number];
const SORTS = ["added", "name", "size"] as const;
type Sort = (typeof SORTS)[number];
type Kind = FileKind;

/** What a files tab shows, kept in the address of the record it sits on. */
export const areaViewSearch = {
  fileSearch: v.fallback(
    v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
    "",
  ),
  fileKinds: v.fallback(v.optional(v.array(v.picklist(FILE_KINDS)), []), []),
  fileSort: v.fallback(v.optional(v.picklist(SORTS), "added"), "added"),
  fileOrder: v.fallback(
    v.optional(v.picklist(["asc", "desc"]), "desc"),
    "desc",
  ),
};
export type AreaView = v.InferOutput<
  v.ObjectSchema<typeof areaViewSearch, undefined>
>;

const TRASH_DAYS = 30;

const KIND_LABEL: Record<Kind, () => string> = {
  pictures: m.filesTypePictures,
  documents: m.filesTypeDocuments,
  audio: m.filesTypeAudio,
  video: m.filesTypeVideo,
  other: m.filesTypeOther,
};

const factsOf = (file: AreaFile) =>
  fileMeta(
    { name: file.name, mime: file.mediaType, bytes: file.sizeBytes },
    getLocale(),
  );

interface UsedInProps {
  file: AreaFile;
  area: Area;
}

function UsedIn({ file, area }: UsedInProps) {
  if (file.usedIn.length === 0)
    return <span className="text-muted-foreground">{m.filesNotUsed()}</span>;
  return (
    <span className="grid gap-0.5 py-0.5">
      {file.usedIn.map((use) =>
        use.hostType === "lesson" ? (
          <Link
            key={use.hostId}
            to="/lesson-editor"
            search={{ id: use.hostId, moduleId: area.id }}
            className="block overflow-hidden leading-5 hover:text-primary hover:underline"
          >
            <bdi>{use.title}</bdi>
          </Link>
        ) : (
          <Link
            key={use.hostId}
            to="/assignments/$assignmentId"
            params={{ assignmentId: use.hostId }}
            search={{}}
            className="block overflow-hidden leading-5 hover:text-primary hover:underline"
          >
            <bdi>{use.title}</bdi>
          </Link>
        ),
      )}
    </span>
  );
}

interface Area {
  type: FileArea;
  id: string;
}

function areaColumns(
  area: Area,
  setViewing: (file: AreaFile) => void,
): Column<AreaFile, Sort>[] {
  return [
    {
      id: "name",
      header: m.filesColumnName(),
      sort: "name",
      primary: true,
      cell: (file) => (
        <button
          type="button"
          onClick={() => setViewing(file)}
          className="inline-flex min-w-0 items-center gap-2 text-start font-medium hover:text-primary hover:underline"
        >
          <FileIcon
            file={{ name: file.name, mime: file.mediaType }}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <bdi className="truncate">{file.name}</bdi>
        </button>
      ),
    },
    {
      id: "kind",
      header: m.filesColumnKind(),
      sort: "size",
      cell: (file) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {factsOf(file)}
        </span>
      ),
    },
    {
      id: "used",
      header: m.filesColumnUsedIn(),
      cell: (file) => <UsedIn file={file} area={area} />,
    },
    {
      id: "added",
      header: m.filesColumnAdded(),
      sort: "added",
      cell: (file) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(file.createdAt)}
        </span>
      ),
    },
  ];
}

function areaCard(area: Area) {
  return {
    leading: (file: AreaFile) => (
      <FileIcon
        file={{ name: file.name, mime: file.mediaType }}
        className="size-5 text-muted-foreground"
      />
    ),
    title: (file: AreaFile) => <bdi>{file.name}</bdi>,
    fact: (file: AreaFile) => (
      <span className="grid gap-0.5">
        <span>{factsOf(file)}</span>
        <UsedIn file={file} area={area} />
      </span>
    ),
  };
}

/** What the replacement chooser offers: files of the same kind as the one replaced. */
function sameKind(
  file: AreaFile,
  accept: Record<"image" | "file" | "media" | "captions", string[]>,
) {
  const family = fileFamily(file.name, file.mediaType);
  if (family === "image") return accept.image.join(",");
  if (family === "audio")
    return accept.media.filter((type) => type.startsWith("audio/")).join(",");
  if (family === "video")
    return accept.media.filter((type) => type.startsWith("video/")).join(",");
  return accept.file.join(",");
}

export interface AreaFilesProps {
  area: Area;
  title: string;
  view: AreaView;
  /**
   * Receives only what changed, to merge into the address as it stands: a
   * search sent after a pause must not put back the kinds of an older view.
   */
  onView: (change: Partial<AreaView>) => void;
}

/**
 * A class's or module's file area: everything its documents show, kept once
 * and listed with where each file is used. Deleting moves a file to a trash
 * kept for 30 days; the documents showing it show it as removed meanwhile.
 */
export function AreaFiles({ area, title, view, onView }: AreaFilesProps) {
  const search = view.fileSearch;
  const kinds: Kind[] = view.fileKinds;
  const sort = { value: view.fileSort, direction: view.fileOrder };
  const [page, setPage] = useState(1);
  // Another search, kind or order starts again at the first page.
  const asked = `${search}|${kinds.join(",")}|${sort.value}|${sort.direction}`;
  const [askedFor, setAskedFor] = useState(asked);
  if (asked !== askedFor) {
    setAskedFor(asked);
    setPage(1);
  }
  const {
    files,
    usage,
    kinds: kindTotals,
  } = useSuspenseQuery(
    areaFilesQuery(area, false, {
      q: search.trim(),
      kinds,
      sort: sort.value,
      order: sort.direction,
      page,
    }),
  ).data;
  const queryClient = useQueryClient();
  const media = useDocumentMedia(area);
  const add = useServerFn(addToArea);
  const trash = useServerFn(trashInArea);
  const replace = useServerFn(replaceInArea);
  const fetchVersions = useServerFn(getFileVersions);
  const refreshFacts = useRefreshFileFacts();
  const input = useRef<HTMLInputElement>(null);
  const replacement = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<AreaFile | null>(null);
  const [versionsOf, setVersionsOf] = useState<AreaFile | null>(null);
  const setSearch = (fileSearch: string) => onView({ fileSearch });
  const setKinds = (next: string[]) =>
    onView({
      fileKinds: FILE_KINDS.filter((kind) => next.includes(kind)),
    });
  const [viewing, setViewing] = useState<AreaFile | null>(null);
  const [renaming, setRenaming] = useState<AreaFile | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["files", "area", area.type, area.id],
    });

  const initiate = useServerFn(initiateUpload);
  /** Uploads go into the area, or under a file already there as its new bytes. */
  const queue = useUploadQueue({
    scope: `files:${area.type}:${area.id}`,
    upload: (file, options, keeping) =>
      uploadDocumentFile(
        initiate,
        file,
        area,
        options,
        "document_media",
        keeping,
      ),
    place: async (sent, meta) => {
      if (meta.replace) {
        await replace({
          data: { area, id: meta.replace, sourceId: sent.fileId },
        });
        refreshFacts([meta.replace]);
        toast.success(m.filesReplaced());
      } else await add({ data: { area, ids: [sent.fileId] } });
      await refresh();
    },
  });

  const shown = files.rows;

  const columns = areaColumns(area, setViewing);

  const rowActions = (file: AreaFile): RowAction[] => [
    {
      label: m.fileOpen(),
      icon: Eye,
      onSelect: () => setViewing(file),
    },
    {
      label: m.editorDownloadFile(),
      icon: Download,
      onSelect: () => window.location.assign(`/files/${file.id}?download`),
    },
    {
      label: m.filesRename(),
      icon: Pencil,
      onSelect: () => setRenaming(file),
    },
    {
      label: m.filesReplace(),
      icon: Replace,
      onSelect: () => {
        setReplacing(file);
        const chooser = replacement.current;
        if (!chooser) return;
        chooser.accept = sameKind(file, media.accept);
        chooser.click();
      },
    },
    ...(file.versions > 0
      ? [
          {
            label: m.filesVersions(),
            icon: History,
            onSelect: () => setVersionsOf(file),
          },
        ]
      : []),
    {
      label: m.filesDelete(),
      icon: Trash2,
      destructive: true,
      confirm: {
        title: m.filesDeleteTitle({ name: file.name }),
        body:
          file.usedIn.length > 0
            ? m.filesDeleteUsed({
                list: formatList(file.usedIn.map((use) => use.title)),
              })
            : m.filesDeleteUnused(),
        label: m.filesDelete(),
      },
      onSelect: async () => {
        await trash({ data: { area, id: file.id, trashed: true } });
        await refresh();
        toast.success(m.filesDeleted());
      },
    },
  ];

  return (
    <FileDropZone
      className="grid gap-4"
      label={m.filesDropHere({ title })}
      onFiles={(dropped) => queue.add(dropped, { replace: null })}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-[13px] leading-[18px] text-muted-foreground">
          {area.type === "class" ? m.filesClassHint() : m.filesModuleHint()}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            className="max-md:h-10"
            onClick={() => setTrashOpen(true)}
          >
            <Trash2 aria-hidden />
            {m.filesTrash()}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() => input.current?.click()}
          >
            <Upload aria-hidden />
            {m.filesUpload()}
          </Button>
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
              queue.add(chosen, { replace: null });
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
        </div>
      </div>
      <UsageBar
        usedBytes={usage.usedBytes}
        limitBytes={usage.limitBytes}
        className="max-w-md"
      />
      <UploadQueue
        label={m.filesUploading()}
        items={queue.items}
        onCancel={queue.cancel}
        onRetry={queue.retry}
        onDismiss={queue.dismiss}
      />
      <DataTable
        caption={m.filesCaption({ title })}
        rows={shown}
        columns={columns}
        rowLabel={(file) => file.name}
        rowActions={rowActions}
        toolbar={{
          search: {
            value: search,
            onChange: setSearch,
            label: m.filesSearch(),
            placeholder: m.filesSearch(),
          },
          facets: [
            {
              id: "kind",
              label: m.filesType(),
              options: FILE_KINDS.map((kind) => ({
                value: kind,
                label: KIND_LABEL[kind](),
                count: kindTotals[kind] ?? 0,
              })),
              selected: kinds,
              onChange: setKinds,
            },
          ],
          onReset: () => {
            onView({ fileSearch: "", fileKinds: [] });
          },
        }}
        sort={{
          value: sort.value,
          direction: sort.direction,
          onChange: (value, direction) =>
            onView({ fileSort: value, fileOrder: direction }),
        }}
        card={areaCard(area)}
        pagination={
          files.pages > 1
            ? {
                page: files.page,
                pages: files.pages,
                total: files.total,
                pageSize: files.pageSize,
                onPage: setPage,
              }
            : undefined
        }
        empty={{
          icon: FolderOpen,
          title: m.filesEmpty(),
          description:
            area.type === "class" ? m.filesEmptyClass() : m.filesEmptyModule(),
        }}
      />
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
      {renaming ? (
        <RenameSheet
          key={renaming.id}
          area={area}
          file={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={refresh}
        />
      ) : null}
      <VersionsSheet
        file={versionsOf}
        load={(id) => fetchVersions({ data: { area, id } })}
        restore={(id, versionId) =>
          replace({ data: { area, id, sourceId: versionId } })
        }
        onOpenChange={(open) => {
          if (!open) setVersionsOf(null);
        }}
        onRestored={async (id) => {
          refreshFacts([id]);
          await refresh();
        }}
      />
      <TrashSheet
        area={area}
        open={trashOpen}
        onOpenChange={setTrashOpen}
        onRestored={refresh}
      />
    </FileDropZone>
  );
}

interface RenameSheetProps {
  area: Area;
  file: AreaFile;
  onClose: () => void;
  onRenamed: () => Promise<unknown>;
}

function RenameSheet({ area, file, onClose, onRenamed }: RenameSheetProps) {
  const rename = useServerFn(renameInArea);
  const refreshFacts = useRefreshFileFacts();
  const [name, setName] = useState(file.name);
  const mutation = useMutation({
    mutationFn: () => rename({ data: { area, id: file.id, name } }),
  });
  return (
    <SheetForm
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={m.filesRenameTitle({ name: file.name })}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (!name.trim()) return;
        await mutation.mutateAsync().then(
          async () => {
            refreshFacts([file.id]);
            await onRenamed();
            toast.success(m.filesRenamed());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <TextField
        id="area-file-name"
        label={m.filesColumnName()}
        dir="auto"
        width="name"
        maxLength={255}
        autoComplete="off"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
    </SheetForm>
  );
}

interface TrashSheetProps {
  area: Area;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: () => Promise<unknown>;
}

function TrashSheet({ area, open, onOpenChange, onRestored }: TrashSheetProps) {
  const trashed = useQuery({ ...areaFilesQuery(area, true), enabled: open });
  const restore = useServerFn(trashInArea);
  const [busy, setBusy] = useState<string | null>(null);
  const files = trashed.data?.files.rows ?? [];
  return (
    <SheetPanel
      open={open}
      onOpenChange={onOpenChange}
      title={m.filesTrash()}
      description={m.filesTrashHint()}
    >
      {trashed.isPending ? (
        <div aria-busy="true" className="min-h-24" />
      ) : files.length === 0 ? (
        <RecordEmpty>{m.filesTrashEmpty()}</RecordEmpty>
      ) : (
        <RecordList>
          {files.map((file) => {
            const deleted = file.trashedAt ?? file.createdAt;
            const until = new Date(
              new Date(deleted).getTime() + TRASH_DAYS * 24 * 60 * 60 * 1000,
            ).toISOString();
            return (
              <li key={file.id} className="flex items-center gap-3 py-3">
                <FileIcon
                  file={{ name: file.name, mime: file.mediaType }}
                  className="size-5 shrink-0 text-muted-foreground"
                />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <bdi className="truncate text-sm leading-5 font-medium">
                    {file.name}
                  </bdi>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {m.filesTrashFact({
                      date: formatDate(deleted),
                      until: formatDate(until),
                    })}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="max-md:h-10"
                  disabled={busy !== null}
                  aria-label={m.filesRestoreNamed({ name: file.name })}
                  onClick={async () => {
                    setBusy(file.id);
                    try {
                      await restore({
                        data: { area, id: file.id, trashed: false },
                      });
                      await Promise.all([trashed.refetch(), onRestored()]);
                      toast.success(m.filesRestored());
                    } catch (error) {
                      toast.error(getMessageFromError(error));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  <RotateCcw aria-hidden />
                  {m.filesRestore()}
                </Button>
              </li>
            );
          })}
        </RecordList>
      )}
    </SheetPanel>
  );
}
