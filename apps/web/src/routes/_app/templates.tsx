import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type {
  Facet,
  IndexToolbarProps,
} from "@faridalms/ui/system/index-toolbar";

import { pageField } from "@faridalms/domain/paging";
import {
  kindsWritten,
  TEMPLATE_AUTHORS,
  TEMPLATE_KINDS,
} from "@faridalms/domain/templates";
import { DataTable } from "@faridalms/ui/system/data-table";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookMarked, Eye, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { Piece } from "~/components/templates/PieceSheet";

import { labelOf } from "~/components/people/format";
import { KIND_LABEL, PieceSheet } from "~/components/templates/PieceSheet";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { subjectsQuery } from "~/queries/classes";
import { templatesQuery, templateQueueQuery } from "~/queries/templates";
import { currentUserQuery } from "~/queries/user";
import { removeTemplate } from "~/server/templates";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { requirePage } from "~/utils/page-access";

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
  page: v.fallback(pageField, 1),
});

export const Route = createFileRoute("/_app/templates")({
  staticData: { breadcrumb: m.templatesTitle },
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, ...Object.values(TEMPLATE_AUTHORS).flat());
    await context.queryClient.ensureQueryData(
      templatesQuery({
        kind: deps.kind,
        subjectId: deps.subjectId,
        q: deps.q,
        page: deps.page,
      }),
    );
  },
  component: TemplatesPage,
});

function ownerOf(row: Piece) {
  return row.mine ? m.tplYours() : inLocale(row.ownerNameEn, row.ownerNameAr);
}

interface PieceTitleProps {
  row: Piece;
  onOpen: () => void;
}

function PieceTitle({ row, onOpen }: PieceTitleProps) {
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
      header: m.templatesName(),
      primary: true,
      cell: (row) => (
        <PieceTitle row={row} onOpen={() => show(row, reviewing)} />
      ),
    },
    {
      id: "kind",
      header: m.templatesKind(),
      cell: (row) => KIND_LABEL[row.kind](),
    },
    {
      id: "subject",
      header: m.templatesSubject(),
      cell: (row) => subjectName(row.subjectId),
    },
    {
      id: "owner",
      header: m.templatesBy(),
      cell: (row) => (
        <span className="grid gap-0.5">
          <bdi>{ownerOf(row)}</bdi>
          {stateOf(row)}
        </span>
      ),
    },
    {
      id: "updated",
      header: m.templatesUpdated(),
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

function TemplatesPage() {
  const user = useCurrentUser();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const data = useSuspenseQuery(
    templatesQuery({
      kind: search.kind,
      subjectId: search.subjectId,
      q: search.q,
      page: search.page,
    }),
  ).data;
  const queue = useQuery({ ...templateQueueQuery, enabled: data.reviews });
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
    void navigate({
      search: (previous) => ({ ...previous, page: 1, ...change }),
    });
  const subjectName = (id: string | null) =>
    id ? (labelOf(subjects.find((row) => row.id === id)) ?? "") : "";

  const rowActions =
    (reviewing: boolean) =>
    (row: Piece): RowAction[] => [
      {
        label: m.templatesPreview(),
        icon: Eye,
        inline: true,
        onSelect: () => show(row, reviewing),
      },
      ...(!reviewing && (row.mine || data.reviews)
        ? [
            {
              label: m.templatesRemove(),
              icon: Trash2,
              destructive: true as const,
              confirm: {
                title: m.templatesRemoveTitle({ title: row.title }),
                body: m.templatesRemoveBody(),
                label: m.templatesRemove(),
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
    label: m.templatesKind(),
    single: true,
    options: kindsWritten(user.capabilities).map((kind) => ({
      value: kind,
      label: KIND_LABEL[kind](),
    })),
    selected: search.kind ? [search.kind] : [],
    onChange: ([next = ""]) =>
      patch({ kind: next as v.InferOutput<typeof searchSchema>["kind"] }),
  };
  const subjectFacet: Facet = {
    id: "subject",
    label: m.templatesSubject(),
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
      label: m.templatesSearch(),
    },
    facets: subjects.length > 0 ? [kindFacet, subjectFacet] : [kindFacet],
    onReset: () => patch({ q: "", kind: "", subjectId: "" }),
  };
  const shelf = (
    <DataTable
      caption={m.templatesCaption()}
      rows={data.rows}
      columns={pieceColumns(false, show, subjectName)}
      rowLabel={(row) => row.title}
      toolbar={toolbar}
      rowActions={rowActions(false)}
      card={pieceCard(false, show)}
      pagination={{
        page: data.page,
        pages: data.pages,
        total: data.total,
        pageSize: data.pageSize,
        onPage: (page) => patch({ page }),
      }}
      empty={{
        icon: BookMarked,
        title: m.templatesEmptyTitle(),
        description: m.templatesEmptyBody(),
      }}
    />
  );
  const waiting = queue.data ?? [];
  return (
    <Page width="list">
      <PageHeader
        title={m.templatesTitle()}
        description={m.templatesHint()}
        count={data.total}
      />
      {data.reviews ? (
        <RecordTabs
          label={m.templatesSections()}
          tabs={[
            { value: "shelf", label: m.templatesShelf() },
            {
              value: "review",
              label: `${m.templatesToReview()} ${waiting.length}`,
            },
          ]}
          value={search.tab}
          onChange={(tab) => patch({ tab })}
        >
          {search.tab === "review" ? (
            <DataTable
              caption={m.templatesToReview()}
              rows={waiting}
              columns={pieceColumns(true, show, subjectName)}
              rowLabel={(row) => row.title}
              rowActions={rowActions(true)}
              card={pieceCard(true, show)}
              empty={{
                icon: BookMarked,
                title: m.templatesQueueEmptyTitle(),
                description: m.templatesQueueEmptyBody(),
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
    </Page>
  );
}
