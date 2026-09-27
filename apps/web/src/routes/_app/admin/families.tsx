import type { HouseholdsQuery } from "@faridalms/domain/people";

import { householdsQuerySchema } from "@faridalms/domain/people";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Home, Plus } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import type { Column } from "~/components/system/DataTable";
import type {
  HeaderAction,
  IndexToolbarProps,
} from "~/components/system/IndexPage";

import { Value } from "~/components/app/primitives";
import { displayName } from "~/components/people/format";
import { householdName, HouseholdSheet } from "~/components/people/Households";
import { languageName } from "~/components/people/regions";
import { DataTable, RowLink } from "~/components/system/DataTable";
import { PageHeader, isFiltered } from "~/components/system/IndexPage";
import * as m from "~/i18n/messages";
import { householdsQuery } from "~/queries/households";
import { formatList } from "~/utils/datetime";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof householdsQuery>["queryFn"]>>
>;
type HouseholdRow = Data["rows"][number];

const PAGE_SIZES = [25, 50] as const;
const DEFAULT_SEARCH = v.parse(householdsQuerySchema, {});

export const Route = createFileRoute("/_app/admin/families")({
  validateSearch: householdsQuerySchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(householdsQuery(deps)),
  component: FamiliesPage,
});

function names(row: HouseholdRow, kind: "adult" | "child") {
  const members = row.members.filter((member) => member.kind === kind);
  return members.length ? (
    <bdi>{formatList(members.map((member) => displayName(member)))}</bdi>
  ) : (
    <Value>{null}</Value>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function familyColumns(): Column<HouseholdRow>[] {
  return [
    {
      id: "name",
      header: m.householdName(),
      primary: true,
      cell: (row) => (
        <RowLink to="/families/$householdId" params={{ householdId: row.id }}>
          {householdName(row)}
        </RowLink>
      ),
    },
    {
      id: "children",
      header: m.householdChildren(),
      cell: (row) => names(row, "child"),
    },
    {
      id: "adults",
      header: m.householdAdults(),
      cell: (row) => names(row, "adult"),
    },
    {
      id: "language",
      header: m.householdLanguage(),
      cell: (row) =>
        row.primaryLanguage ? (
          languageName(row.primaryLanguage)
        ) : (
          <Value>{null}</Value>
        ),
    },
  ];
}

const card = {
  title: (row: HouseholdRow) => (
    <RowLink to="/families/$householdId" params={{ householdId: row.id }}>
      {householdName(row)}
    </RowLink>
  ),
  fact: (row: HouseholdRow) => names(row, "child"),
};

function FamiliesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const data = useSuspenseQuery(householdsQuery(search)).data;
  const [sheet, setSheet] = useState({ open: false, key: 0 });
  const patch = (change: Partial<HouseholdsQuery>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  const create: HeaderAction | undefined = data.manage
    ? {
        label: m.householdAdd(),
        icon: Plus,
        onClick: () =>
          setSheet((current) => ({ open: true, key: current.key + 1 })),
      }
    : undefined;
  const toolbar: IndexToolbarProps = {
    search: {
      value: search.q,
      onChange: (q) => patch({ q, page: 1 }),
      label: m.householdSearchHint(),
      placeholder: m.householdSearchPlaceholder(),
    },
    onReset: () => patch({ q: "", page: 1 }),
  };
  return (
    <>
      <PageHeader
        title={m.householdsTitle()}
        count={search.q ? undefined : data.total}
        action={data.total === 0 && !isFiltered(toolbar) ? undefined : create}
      />
      <DataTable
        caption={m.householdsCaption()}
        rows={data.rows}
        columns={familyColumns()}
        rowLabel={(row) => householdName(row)}
        toolbar={toolbar}
        pagination={{
          page: data.page,
          pages: data.pages,
          total: data.total,
          pageSize: search.pageSize,
          pageSizes: [...PAGE_SIZES],
          onPage: (page) => patch({ page }),
          onPageSize: (size) => {
            const pageSize = PAGE_SIZES.find((option) => option === size);
            if (pageSize) patch({ pageSize, page: 1 });
          },
        }}
        card={card}
        empty={{
          icon: Home,
          title: m.householdsEmptyTitle(),
          description: m.householdsEmptyBody(),
        }}
      />
      {data.manage ? (
        <HouseholdSheet
          key={sheet.key}
          household={null}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </>
  );
}
