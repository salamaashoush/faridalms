import type { Column } from "@faridalms/ui/system/data-table";
import type { HeaderAction } from "@faridalms/ui/system/page-header";

import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  FileUp,
  Flag,
  Grid3x3,
  Lightbulb,
  ListTree,
  Plus,
  Sprout,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  FrameworkSheet,
  ImportCaseSheet,
  sourceOf,
} from "~/components/standards/Standards";
import * as m from "~/i18n/messages";
import { frameworksQuery } from "~/queries/standards";
import {
  addDevelopmentMatters,
  addEarlyGoals,
  addIbConcepts,
} from "~/server/standards";
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

interface FrameworkNameProps {
  row: FrameworkRow;
}

function FrameworkName({ row }: FrameworkNameProps) {
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
  const addMatters = useServerFn(addDevelopmentMatters);
  const addConcepts = useServerFn(addIbConcepts);
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
    <Page width="list">
      <PageHeader
        title={m.standardsTitle()}
        description={m.standardsHint()}
        count={data.frameworks.length}
        action={create}
        menu={[
          {
            label: m.curriculumMapTitle(),
            icon: Grid3x3,
            onSelect: () => navigate({ to: "/standards/map", search: {} }),
          },
          ...(data.canManage
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
                {
                  label: m.goalsAddMatters(),
                  icon: Sprout,
                  onSelect: async () => {
                    const added = await addMatters();
                    await queryClient.invalidateQueries({
                      queryKey: ["standards"],
                    });
                    await go(added.id);
                  },
                },
                {
                  label: m.standardsAddIbConcepts(),
                  icon: Lightbulb,
                  onSelect: async () => {
                    await addConcepts();
                    await queryClient.invalidateQueries({
                      queryKey: ["standards"],
                    });
                    toast.success(m.standardsIbConceptsAdded());
                  },
                },
              ]
            : []),
        ]}
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
    </Page>
  );
}
