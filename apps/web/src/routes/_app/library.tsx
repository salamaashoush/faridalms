import { TEMPLATE_KINDS } from "@faridalms/domain/templates";
import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { BookMarked, Eye, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { Piece } from "~/components/library/Library";
import type { Column, RowAction } from "~/components/system/DataTable";
import type { Facet, IndexToolbarProps } from "~/components/system/IndexPage";

import { KIND_LABEL, PieceSheet } from "~/components/library/Library";
import { labelOf } from "~/components/people/format";
import { DataTable } from "~/components/system/DataTable";
import { PageHeader } from "~/components/system/IndexPage";
import { RecordTabs } from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { subjectsQuery } from "~/queries/classes";
import { libraryQuery, libraryQueueQuery } from "~/queries/library";
import { currentUserQuery } from "~/queries/user";
import { removeTemplate } from "~/server/templates";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

const searchSchema = v.object({
  tab: v.fallback(
    v.optional(v.picklist(["shelf", "review"]), "shelf"),
    "shelf",
  ),
  kind: v.fallback(
    v.optional(v.union([v.literal(""), v.picklist(TEMPLATE_KINDS)]), ""),
    "",
  ),
  subjectId: v.fallback(v.optional(v.string(), ""), ""),
  q: v.fallback(v.optional(v.string(), ""), ""),
});

export const Route = createFileRoute("/_app/library")({
  staticData: { breadcrumb: m.libraryTitle },
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (
      !user.capabilities.includes("learning:author") &&
      !user.capabilities.includes("assignments:author")
    )
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await context.queryClient.ensureQueryData(
      libraryQuery({ kind: deps.kind, subjectId: deps.subjectId, q: deps.q }),
    );
  },
  component: LibraryPage,
});

function ownerOf(row: Piece) {
  return row.mine ? m.tplYours() : inLocale(row.ownerNameEn, row.ownerNameAr);
}

function PieceTitle({ row, onOpen }: { row: Piece; onOpen: () => void }) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <button
        type="button"
        onClick={onOpen}
        dir="auto"
        className="truncate text-start font-medium hover:text-primary hover:underline focus-visible:underline focus-visible:outline-none"
      >
        {row.title}
      </button>
      {row.description ? (
        <span
          dir="auto"
          className="line-clamp-1 text-[13px] leading-[18px] text-muted-foreground"
        >
          {row.description}
        </span>
      ) : null}
    </span>
  );
}

function stateOf(row: Piece) {
  return row.state === "pending" ? (
    <StatusText tone="warning">{m.tplPending()}</StatusText>
  ) : row.state === "declined" ? (
    <StatusText tone="danger">{m.tplDeclined()}</StatusText>
  ) : null;
}

type Open = (row: Piece, reviewing: boolean) => void;

function pieceColumns(
  reviewing: boolean,
  show: Open,
  subjectName: (id: string | null) => string,
): Column<Piece>[] {
  return [
    {
      id: "title",
      header: m.libraryName(),
      primary: true,
      cell: (row) => (
        <PieceTitle row={row} onOpen={() => show(row, reviewing)} />
      ),
    },
    {
      id: "kind",
      header: m.libraryKind(),
      cell: (row) => KIND_LABEL[row.kind](),
    },
    {
      id: "subject",
      header: m.librarySubject(),
      cell: (row) => subjectName(row.subjectId),
    },
    {
      id: "owner",
      header: m.libraryBy(),
      cell: (row) => (
        <span className="grid gap-0.5">
          <bdi>{ownerOf(row)}</bdi>
          {stateOf(row)}
        </span>
      ),
    },
    {
      id: "updated",
      header: m.libraryUpdated(),
      cell: (row) => formatDate(row.updatedAt),
    },
  ];
}

function pieceCard(reviewing: boolean, show: Open) {
  return {
    title: (row: Piece) => (
      <PieceTitle row={row} onOpen={() => show(row, reviewing)} />
    ),
    fact: (row: Piece) =>
      [KIND_LABEL[row.kind](), ownerOf(row)].filter(Boolean).join(" · "),
    status: stateOf,
  };
}

function LibraryPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const data = useSuspenseQuery(
    libraryQuery({
      kind: search.kind,
      subjectId: search.subjectId,
      q: search.q,
    }),
  ).data;
  const queue = useQuery({ ...libraryQueueQuery, enabled: data.reviews });
  const subjects = useQuery(subjectsQuery).data?.rows ?? [];
  const [open, setOpen] = useState<{
    piece: Piece;
    reviewing: boolean;
    key: number;
    open: boolean;
  }>();
  const show = (piece: Piece, reviewing: boolean) =>
    setOpen((current) => ({
      piece,
      reviewing,
      key: (current?.key ?? 0) + 1,
      open: true,
    }));
  const patch = (change: Partial<v.InferOutput<typeof searchSchema>>) =>
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  const subjectName = (id: string | null) =>
    id ? (labelOf(subjects.find((row) => row.id === id)) ?? "") : "";

  const rowActions =
    (reviewing: boolean) =>
    (row: Piece): RowAction[] => [
      {
        label: m.libraryPreview(),
        icon: Eye,
        inline: true,
        onSelect: () => show(row, reviewing),
      },
      ...(!reviewing && (row.mine || data.reviews)
        ? [
            {
              label: m.libraryRemove(),
              icon: Trash2,
              destructive: true as const,
              confirm: {
                title: m.libraryRemoveTitle({ title: row.title }),
                body: m.libraryRemoveBody(),
                label: m.libraryRemove(),
              },
              onSelect: async () => {
                try {
                  await removeTemplate({ data: { id: row.id } });
                  toast.success(m.tplRemoved());
                  await queryClient.invalidateQueries({
                    queryKey: ["templates"],
                  });
                } catch (error) {
                  toast.error(getMessageFromError(error));
                }
              },
            },
          ]
        : []),
    ];
  const kindFacet: Facet = {
    id: "kind",
    label: m.libraryKind(),
    single: true,
    options: TEMPLATE_KINDS.map((kind) => ({
      value: kind,
      label: KIND_LABEL[kind](),
    })),
    selected: search.kind ? [search.kind] : [],
    onChange: ([next = ""]) =>
      patch({ kind: next as v.InferOutput<typeof searchSchema>["kind"] }),
  };
  const subjectFacet: Facet = {
    id: "subject",
    label: m.librarySubject(),
    single: true,
    options: subjects.map((row) => ({
      value: row.id,
      label: labelOf(row) ?? row.code,
    })),
    selected: search.subjectId ? [search.subjectId] : [],
    onChange: ([next = ""]) => patch({ subjectId: next }),
  };
  const toolbar: IndexToolbarProps = {
    search: {
      value: search.q,
      onChange: (q) => patch({ q }),
      label: m.librarySearch(),
    },
    facets: subjects.length > 0 ? [kindFacet, subjectFacet] : [kindFacet],
    onReset: () => patch({ q: "", kind: "", subjectId: "" }),
  };
  const shelf = (
    <DataTable
      caption={m.libraryCaption()}
      rows={data.rows}
      columns={pieceColumns(false, show, subjectName)}
      rowLabel={(row) => row.title}
      toolbar={toolbar}
      rowActions={rowActions(false)}
      card={pieceCard(false, show)}
      empty={{
        icon: BookMarked,
        title: m.libraryEmptyTitle(),
        description: m.libraryEmptyBody(),
      }}
    />
  );
  const waiting = queue.data ?? [];
  return (
    <>
      <PageHeader
        title={m.libraryTitle()}
        description={m.libraryHint()}
        count={data.rows.length}
      />
      {data.reviews ? (
        <RecordTabs
          label={m.librarySections()}
          tabs={[
            { value: "shelf", label: m.libraryShelf() },
            {
              value: "review",
              label: `${m.libraryToReview()} ${waiting.length}`,
            },
          ]}
          value={search.tab}
          onChange={(tab) => patch({ tab })}
        >
          {search.tab === "review" ? (
            <DataTable
              caption={m.libraryToReview()}
              rows={waiting}
              columns={pieceColumns(true, show, subjectName)}
              rowLabel={(row) => row.title}
              rowActions={rowActions(true)}
              card={pieceCard(true, show)}
              empty={{
                icon: BookMarked,
                title: m.libraryQueueEmptyTitle(),
                description: m.libraryQueueEmptyBody(),
              }}
            />
          ) : (
            shelf
          )}
        </RecordTabs>
      ) : (
        shelf
      )}
      {open ? (
        <PieceSheet
          key={open.key}
          piece={open.piece}
          reviewing={open.reviewing}
          open={open.open}
          onClose={() =>
            setOpen((current) => current && { ...current, open: false })
          }
        />
      ) : null}
    </>
  );
}
