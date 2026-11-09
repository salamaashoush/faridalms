import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";

import { FileIcon, fileMeta, FileViewer } from "@faridalms/editor/files";
import { DataTable } from "@faridalms/ui/system/data-table";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, FileStack, LibraryBig } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { mediaInDocuments } from "~/server/media";

import { fileStrings } from "~/components/content/strings";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { mediaInDocumentsQuery } from "~/queries/media";
import { keepInMedia } from "~/server/media";
import { formatDate, formatNumber } from "~/utils/datetime";

import { hostKindLabel } from "./media-items";

type DocumentsPage = Awaited<ReturnType<typeof mediaInDocuments>>;
type DocumentUpload = DocumentsPage["items"]["rows"][number];

const isPicture = (row: DocumentUpload) =>
  row.mediaType.toLowerCase().startsWith("image/");

const uploaderOf = (row: DocumentUpload) =>
  row.uploadedBy
    ? inLocale(row.uploadedBy.fullNameEn, row.uploadedBy.fullNameAr)
    : "";

function columns(
  open: (row: DocumentUpload) => void,
): Column<DocumentUpload>[] {
  return [
    {
      id: "name",
      header: m.filesColumnName(),
      primary: true,
      cell: (row) => (
        <button
          type="button"
          onClick={() => open(row)}
          className="inline-flex min-w-0 items-center gap-2 text-start font-medium hover:text-primary hover:underline"
        >
          <FileIcon
            file={{ name: row.name, mime: row.mediaType }}
            className="size-4 shrink-0 text-muted-foreground"
          />
          <bdi className="truncate">{row.name}</bdi>
        </button>
      ),
    },
    {
      id: "in",
      header: m.mediaFoundIn(),
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {hostKindLabel(row.hostType)}
        </span>
      ),
    },
    {
      id: "by",
      header: m.mediaUploadedBy(),
      cell: (row) =>
        uploaderOf(row) ? (
          <bdi className="whitespace-nowrap">{uploaderOf(row)}</bdi>
        ) : (
          <span className="text-muted-foreground">{m.commonNotRecorded()}</span>
        ),
    },
    {
      id: "added",
      header: m.filesColumnAdded(),
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDate(row.createdAt)}
        </span>
      ),
    },
  ];
}

const card: DataTableCard<DocumentUpload> = {
  leading: (row) =>
    isPicture(row) ? (
      <img
        src={`/files/${row.id}`}
        alt=""
        loading="lazy"
        className="size-10 rounded-md object-cover"
      />
    ) : (
      <FileIcon
        file={{ name: row.name, mime: row.mediaType }}
        className="size-5 text-muted-foreground"
      />
    ),
  title: (row) => <bdi>{row.name}</bdi>,
  fact: (row) => (
    <span>
      {hostKindLabel(row.hostType)} ·{" "}
      {fileMeta(
        { name: row.name, mime: row.mediaType, bytes: row.sizeBytes },
        getLocale(),
      )}
    </span>
  ),
};

export interface MediaInDocumentsProps {
  q: string;
  page: number;
  folderId: string | null;
  onSearch: (q: string) => void;
  onPage: (page: number) => void;
}

/**
 * What staff uploaded straight into documents and media does not hold
 * yet, newest first, each kept in media in one step, alone or several
 * at once. Students' work and conversations never appear here.
 */
export function MediaInDocuments({
  q,
  page,
  folderId,
  onSearch,
  onPage,
}: MediaInDocumentsProps) {
  const data = useSuspenseQuery(
    mediaInDocumentsQuery({ q: q.trim(), page }),
  ).data;
  const queryClient = useQueryClient();
  const keep = useServerFn(keepInMedia);
  const [viewing, setViewing] = useState<DocumentUpload | null>(null);
  const keepAll = async (rows: DocumentUpload[]) => {
    for (const row of rows) await keep({ data: { fileId: row.id, folderId } });
    await queryClient.invalidateQueries({ queryKey: ["media"] });
    toast.success(
      m.mediaKeptMany({ count: rows.length, value: formatNumber(rows.length) }),
    );
  };
  return (
    <>
      <DataTable
        caption={m.mediaInDocuments()}
        rows={data.items.rows}
        columns={columns(setViewing)}
        rowLabel={(row) => row.name}
        rowActions={(row) => [
          { label: m.fileOpen(), icon: Eye, onSelect: () => setViewing(row) },
          {
            label: m.mediaKeep(),
            icon: LibraryBig,
            onSelect: () => keepAll([row]),
          },
        ]}
        batchActions={[
          { label: m.mediaKeep(), icon: LibraryBig, onSelect: keepAll },
        ]}
        toolbar={{
          search: {
            value: q,
            onChange: onSearch,
            label: m.mediaSearch(),
            placeholder: m.mediaSearch(),
          },
          onReset: () => onSearch(""),
        }}
        card={card}
        pagination={
          data.items.pages > 1
            ? {
                page: data.items.page,
                pages: data.items.pages,
                total: data.items.total,
                pageSize: data.items.pageSize,
                onPage,
              }
            : undefined
        }
        empty={{
          icon: FileStack,
          title: m.mediaInDocumentsEmpty(),
          description: m.mediaInDocumentsEmptyBody(),
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
    </>
  );
}
