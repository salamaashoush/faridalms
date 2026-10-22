import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Flag, ListTree, Plus } from "lucide-react";
import { useState } from "react";

import type { Column } from "~/components/system/DataTable";
import type { HeaderAction } from "~/components/system/IndexPage";

import {
  FrameworkSheet,
  ImportCaseSheet,
  sourceOf,
} from "~/components/standards/Standards";
import { DataTable, RowLink } from "~/components/system/DataTable";
import { PageHeader } from "~/components/system/IndexPage";
import * as m from "~/i18n/messages";
import { frameworksQuery } from "~/queries/standards";
import { addEarlyGoals } from "~/server/standards";
import { formatNumber } from "~/utils/datetime";

type Data = Awaited<
  ReturnType<NonNullable<(typeof frameworksQuery)["queryFn"]>>
>;
type FrameworkRow = Data["frameworks"][number];

export const Route = createFileRoute("/_app/standards/")({
  staticData: { breadcrumb: m.standardsTitle },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(frameworksQuery);
  },
  component: FrameworksPage,
});

function FrameworkName({ row }: { row: FrameworkRow }) {
  return (
    <RowLink
      to="/standards/$frameworkId"
      params={{ frameworkId: row.id }}
      search={{}}
    >
      <span dir="auto">{row.title}</span>
    </RowLink>
  );
}

function columns(): Column<FrameworkRow>[] {
  return [
    {
      id: "title",
      header: m.standardsFramework(),
      primary: true,
      cell: (row) => <FrameworkName row={row} />,
    },
    {
      id: "source",
      header: m.standardsSource(),
      cell: (row) => sourceOf(row),
    },
    {
      id: "standards",
      header: m.standardsCount(),
      className: "text-end",
      cell: (row) => (
        <span className="tabular-nums">{formatNumber(row.standards)}</span>
      ),
    },
  ];
}

const frameworkCard = {
  title: (row: FrameworkRow) => <FrameworkName row={row} />,
  fact: (row: FrameworkRow) => m.standardsCountOf({ count: row.standards }),
};

function FrameworksPage() {
  const data = useSuspenseQuery(frameworksQuery).data;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addGoals = useServerFn(addEarlyGoals);
  const [sheet, setSheet] = useState<"new" | "import" | null>(null);
  const [key, setKey] = useState(0);
  const open = (next: "new" | "import") => {
    setKey((current) => current + 1);
    setSheet(next);
  };
  const go = (id: string) =>
    navigate({
      to: "/standards/$frameworkId",
      params: { frameworkId: id },
      search: {},
    });
  const create: HeaderAction | undefined = data.canManage
    ? {
        label: m.standardsNewFramework(),
        icon: Plus,
        onClick: () => open("new"),
      }
    : undefined;
  return (
    <>
      <PageHeader
        title={m.standardsTitle()}
        description={m.standardsHint()}
        count={data.frameworks.length}
        action={create}
        menu={
          data.canManage
            ? [
                {
                  label: m.standardsImportCase(),
                  icon: FileUp,
                  onSelect: () => open("import"),
                },
                {
                  label: m.goalsAddEyfs(),
                  icon: Flag,
                  onSelect: async () => {
                    const added = await addGoals();
                    await queryClient.invalidateQueries({
                      queryKey: ["standards"],
                    });
                    await go(added.id);
                  },
                },
              ]
            : []
        }
      />
      <DataTable
        caption={m.standardsCaption()}
        rows={data.frameworks}
        columns={columns()}
        rowLabel={(row) => row.title}
        card={frameworkCard}
        empty={{
          icon: ListTree,
          title: m.standardsEmptyTitle(),
          description: m.standardsEmptyBody(),
        }}
      />
      {data.canManage ? (
        <>
          <FrameworkSheet
            key={`new-${key}`}
            open={sheet === "new"}
            onClose={() => setSheet(null)}
            framework={null}
            onSaved={go}
          />
          <ImportCaseSheet
            key={`import-${key}`}
            open={sheet === "import"}
            onClose={() => setSheet(null)}
            frameworkId=""
            onImported={go}
          />
        </>
      ) : null}
    </>
  );
}
