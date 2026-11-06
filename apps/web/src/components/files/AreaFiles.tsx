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
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { fileStrings } from "~/components/content/strings";
import { UsageBar } from "~/components/files/UsageBar";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { areaFilesQuery } from "~/queries/files";
import {
  addToArea,
  getFileVersions,
  renameInArea,
  replaceInArea,
  trashInArea,
} from "~/server/files";
import { formatDate, formatList, formatNumber } from "~/utils/datetime";
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

function UsedIn({ file, area }: { file: AreaFile; area: Area }) {
  if (file.usedIn.length === 0)
    return <span className="text-muted-foreground">{m.filesNotUsed()}</span>;
  return (
    <span className="grid gap-0.5 py-0.5">
      {file.usedIn.map((use) =>
        use.hostType === "lesson" ? (
          <Link
            key={use.hostId}
            to="/teach/lesson-editor"
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

interface Pending {
  key: string;
  name: string;
  progress: number;
  error: string | null;
}

/**
 * A class's or module's file area: everything its documents show, kept once
 * and listed with where each file is used. Deleting moves a file to a trash
 * kept for 30 days; the documents showing it show it as removed meanwhile.
 */
export function AreaFiles({
  area,
  title,
  view,
  onView,
}: {
  area: Area;
  title: string;
  view: AreaView;
  onView: (view: AreaView) => void;
}) {
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
  const refreshFacts = useRefreshFileFacts();
  const input = useRef<HTMLInputElement>(null);
  const replacement = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<AreaFile | null>(null);
  const [versionsOf, setVersionsOf] = useState<AreaFile | null>(null);
  const setSearch = (fileSearch: string) => onView({ ...view, fileSearch });
  const setKinds = (next: string[]) =>
    onView({
      ...view,
      fileKinds: FILE_KINDS.filter((kind) => next.includes(kind)),
    });
  const [pending, setPending] = useState<Pending[]>([]);
  const [viewing, setViewing] = useState<AreaFile | null>(null);
  const [renaming, setRenaming] = useState<AreaFile | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["files", "area", area.type, area.id],
    });

  /** Uploads a file into the area, or as the new bytes of one already there. */
  const upload = async (file: File, target?: AreaFile) => {
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
      if (target) {
        await replace({
          data: { area, id: target.id, sourceId: sent.fileId },
        });
        refreshFacts([target.id]);
        toast.success(m.filesReplaced());
      } else await add({ data: { area, ids: [sent.fileId] } });
      setPending((rows) => rows.filter((row) => row.key !== key));
      await refresh();
    } catch (error) {
      change({ error: getMessageFromError(error) });
    }
  };

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
    <div className="grid gap-4">
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
              for (const file of chosen) void upload(file);
            }}
          />
          <input
            ref={replacement}
            type="file"
            hidden
            onChange={(event) => {
              const [chosen] = event.target.files ?? [];
              event.target.value = "";
              if (chosen && replacing) void upload(chosen, replacing);
            }}
          />
        </div>
      </div>
      <UsageBar
        usedBytes={usage.usedBytes}
        limitBytes={usage.limitBytes}
        className="max-w-md"
      />
      {pending.length > 0 ? (
        <ul className="grid gap-2" aria-live="polite">
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
            onView({ ...view, fileSearch: "", fileKinds: [] });
          },
        }}
        sort={{
          value: sort.value,
          direction: sort.direction,
          onChange: (value, direction) =>
            onView({ ...view, fileSort: value, fileOrder: direction }),
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
        area={area}
        file={versionsOf}
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
    </div>
  );
}

function RenameSheet({
  area,
  file,
  onClose,
  onRenamed,
}: {
  area: Area;
  file: AreaFile;
  onClose: () => void;
  onRenamed: () => Promise<unknown>;
}) {
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

function TrashSheet({
  area,
  open,
  onOpenChange,
  onRestored,
}: {
  area: Area;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: () => Promise<unknown>;
}) {
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

function VersionsSheet({
  area,
  file,
  onOpenChange,
  onRestored,
}: {
  area: Area;
  file: AreaFile | null;
  onOpenChange: (open: boolean) => void;
  onRestored: (id: string) => Promise<unknown>;
}) {
  const fetchVersions = useServerFn(getFileVersions);
  const restore = useServerFn(replaceInArea);
  const listed = useQuery({
    queryKey: ["files", "versions", file?.id],
    queryFn: () =>
      file
        ? fetchVersions({ data: { area, id: file.id } })
        : Promise.resolve({ versions: [] }),
    enabled: file !== null,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const versions = listed.data?.versions ?? [];
  const shown = versions.find((row) => row.id === viewing);
  return (
    <SheetPanel
      open={file !== null}
      onOpenChange={onOpenChange}
      title={file ? `${m.filesVersions()}: ${file.name}` : m.filesVersions()}
      description={m.filesVersionsHint()}
    >
      {listed.isPending ? (
        <div aria-busy="true" className="min-h-24" />
      ) : versions.length === 0 ? (
        <RecordEmpty>{m.filesVersionsEmpty()}</RecordEmpty>
      ) : (
        <RecordList>
          {versions.map((version) => {
            const until = new Date(
              new Date(version.replacedAt).getTime() +
                TRASH_DAYS * 24 * 60 * 60 * 1000,
            ).toISOString();
            return (
              <li key={version.id} className="flex items-center gap-3 py-3">
                <FileIcon
                  file={{ name: version.name, mime: version.mediaType }}
                  className="size-5 shrink-0 text-muted-foreground"
                />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <button
                    type="button"
                    onClick={() => setViewing(version.id)}
                    className="truncate text-start text-sm leading-5 font-medium hover:text-primary hover:underline"
                  >
                    <bdi>{version.name}</bdi>
                  </button>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {m.filesVersionFact({
                      date: formatDate(version.replacedAt),
                      until: formatDate(until),
                    })}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="max-md:h-10"
                  disabled={busy !== null || !file}
                  aria-label={m.filesRestoreNamed({ name: version.name })}
                  onClick={async () => {
                    if (!file) return;
                    setBusy(version.id);
                    try {
                      await restore({
                        data: { area, id: file.id, sourceId: version.id },
                      });
                      await Promise.all([
                        listed.refetch(),
                        onRestored(file.id),
                      ]);
                      toast.success(m.filesVersionRestored());
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
      {shown ? (
        <FileViewer
          file={{
            name: shown.name,
            mime: shown.mediaType,
            bytes: shown.sizeBytes,
          }}
          url={`/files/${shown.id}`}
          open
          onOpenChange={(open) => {
            if (!open) setViewing(null);
          }}
          strings={fileStrings()}
          locale={getLocale()}
        />
      ) : null}
    </SheetPanel>
  );
}
