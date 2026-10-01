import type { FileArea, FileFamily } from "@faridalms/domain/file";

import { fileFamily } from "@faridalms/domain/file";
import { FileIcon, fileMeta, FileViewer } from "@faridalms/editor/files";
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
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { Column, RowAction } from "~/components/system/DataTable";

import { fileStrings } from "~/components/content/strings";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { DataTable } from "~/components/system/DataTable";
import { TextField } from "~/components/system/field";
import { RecordEmpty, RecordList } from "~/components/system/RecordPage";
import { SheetForm } from "~/components/system/SheetForm";
import { SheetPanel } from "~/components/system/SheetPanel";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { areaFilesQuery } from "~/queries/files";
import { addToArea, renameInArea, trashInArea } from "~/server/files";
import { formatDate, formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type AreaFile = Awaited<
  ReturnType<NonNullable<ReturnType<typeof areaFilesQuery>["queryFn"]>>
>["files"][number];
type Sort = "added" | "name" | "size";
type Kind = "pictures" | "documents" | "audio" | "video" | "other";

const TRASH_DAYS = 30;

const KIND_OF: Record<FileFamily, Kind> = {
  image: "pictures",
  pdf: "documents",
  document: "documents",
  sheet: "documents",
  slides: "documents",
  text: "documents",
  audio: "audio",
  video: "video",
  archive: "other",
  other: "other",
};

const KIND_LABEL: Record<Kind, () => string> = {
  pictures: m.filesTypePictures,
  documents: m.filesTypeDocuments,
  audio: m.filesTypeAudio,
  video: m.filesTypeVideo,
  other: m.filesTypeOther,
};

const kindOf = (file: AreaFile) =>
  KIND_OF[fileFamily(file.name, file.mediaType)];

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
            className="block truncate leading-5 hover:text-primary hover:underline"
          >
            <bdi>{use.title}</bdi>
          </Link>
        ) : (
          <Link
            key={use.hostId}
            to="/assignments/$assignmentId"
            params={{ assignmentId: use.hostId }}
            search={{}}
            className="block truncate leading-5 hover:text-primary hover:underline"
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
export function AreaFiles({ area, title }: { area: Area; title: string }) {
  const { files } = useSuspenseQuery(areaFilesQuery(area, false)).data;
  const queryClient = useQueryClient();
  const media = useDocumentMedia();
  const add = useServerFn(addToArea);
  const trash = useServerFn(trashInArea);
  const input = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [kinds, setKinds] = useState<string[]>([]);
  const [sort, setSort] = useState<{ value: Sort; direction: "asc" | "desc" }>({
    value: "added",
    direction: "desc",
  });
  const [pending, setPending] = useState<Pending[]>([]);
  const [viewing, setViewing] = useState<AreaFile | null>(null);
  const [renaming, setRenaming] = useState<AreaFile | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["files", "area", area.type, area.id],
    });

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
      await add({ data: { area, ids: [sent.fileId] } });
      setPending((rows) => rows.filter((row) => row.key !== key));
      await refresh();
    } catch (error) {
      change({ error: getMessageFromError(error) });
    }
  };

  const query = search.trim().toLocaleLowerCase();
  const shown = files
    .filter(
      (file) =>
        (!query || file.name.toLocaleLowerCase().includes(query)) &&
        (kinds.length === 0 || kinds.includes(kindOf(file))),
    )
    .toSorted((a, b) => {
      const order =
        sort.value === "name"
          ? a.name.localeCompare(b.name, getLocale())
          : sort.value === "size"
            ? a.sizeBytes - b.sizeBytes
            : a.createdAt.localeCompare(b.createdAt);
      return sort.direction === "asc" ? order : -order;
    });

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

  const kindCounts = new Map<Kind, number>();
  for (const file of files)
    kindCounts.set(kindOf(file), (kindCounts.get(kindOf(file)) ?? 0) + 1);

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
        </div>
      </div>
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
                    size="sm"
                    onClick={() =>
                      setPending((rows) =>
                        rows.filter((item) => item.key !== row.key),
                      )
                    }
                  >
                    {m.fileDismissNamed({ name: row.name })}
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
              options: (Object.keys(KIND_LABEL) as Kind[]).map((kind) => ({
                value: kind,
                label: KIND_LABEL[kind](),
                count: kindCounts.get(kind) ?? 0,
              })),
              selected: kinds,
              onChange: setKinds,
            },
          ],
          onReset: () => {
            setSearch("");
            setKinds([]);
          },
        }}
        sort={{
          value: sort.value,
          direction: sort.direction,
          onChange: (value, direction) => setSort({ value, direction }),
        }}
        card={areaCard(area)}
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
  const files = trashed.data?.files ?? [];
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
