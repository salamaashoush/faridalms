import type { ModuleState } from "@faridalms/domain/learning";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type {
  Facet,
  IndexToolbarProps,
} from "@faridalms/ui/system/index-toolbar";
import type { HeaderAction } from "@faridalms/ui/system/page-header";

import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { CalendarRange, Import, Layers, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import { classChoices, classTitle } from "~/components/classes/format";
import { CartridgeImport } from "~/components/learning/CartridgeImport";
import {
  shownState,
  STATE_LABEL,
  STATE_TONE,
} from "~/components/learning/format";
import * as m from "~/i18n/messages";
import { teachingModulesQuery } from "~/queries/learning";
import { currentUserQuery } from "~/queries/user";
import { formatNumber } from "~/utils/datetime";
import { requirePage } from "~/utils/page-access";

const TABS = [
  "published",
  "draft",
  "archived",
] as const satisfies readonly ModuleState[];

const searchSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(TABS), "published"), "published"),
  classId: v.fallback(
    v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
    "",
  ),
  q: v.fallback(v.optional(v.pipe(v.string(), v.maxLength(200)), ""), ""),
});
type Search = v.InferOutput<typeof searchSchema>;
const DEFAULT_SEARCH = v.parse(searchSchema, {});

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof teachingModulesQuery>["queryFn"]>>
>;
type Row = Data["rows"][number];

export const Route = createFileRoute("/_app/_staff/modules")({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => ({ classId: search.classId }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "learning:author");
    await context.queryClient.ensureQueryData(
      teachingModulesQuery(deps.classId),
    );
  },
  component: ModulesPage,
});

const TAB_LABEL: Record<(typeof TABS)[number], () => string> = {
  published: m.lrnTabOpen,
  draft: m.lrnTabDrafts,
  archived: m.lrnTabArchived,
};

interface TitleProps {
  row: Row;
}

function Title({ row }: TitleProps) {
  return (
    <RowLink to="/modules/$moduleId" params={{ moduleId: row.id }} search={{}}>
      {row.title}
    </RowLink>
  );
}

interface StateProps {
  row: Row;
}

function State({ row }: StateProps) {
  const state = shownState(row);
  return (
    <StatusText tone={STATE_TONE[state]}>{STATE_LABEL[state]()}</StatusText>
  );
}

const classesOf = (row: Row) =>
  row.classes.map((item) => classTitle(item)).join(", ");

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function columns(): Column<Row>[] {
  return [
    {
      id: "title",
      header: m.lrnModuleTitle(),
      primary: true,
      cell: (row) => (
        <div className="grid min-w-0">
          <Title row={row} />
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {classesOf(row)}
          </span>
        </div>
      ),
    },
    { id: "state", header: m.lrnState(), cell: (row) => <State row={row} /> },
    {
      id: "lessons",
      header: m.lrnLessons(),
      cell: (row) => (
        <span className="tabular-nums">
          {m.lrnLessonCount({ count: row.lessons })}
        </span>
      ),
    },
  ];
}

const card = {
  title: (row: Row) => <Title row={row} />,
  status: (row: Row) => <State row={row} />,
  fact: (row: Row) => m.lrnLessonCount({ count: row.lessons }),
};

function ModulesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const data = useSuspenseQuery(teachingModulesQuery(search.classId)).data;
  const [importing, setImporting] = useState(false);
  const patch = (change: Partial<Search>) => {
    void navigate({
      resetScroll: false,
      search: (previous) => ({ ...previous, ...change }),
    });
  };
  const needle = search.q.trim().toLowerCase();
  const matching = data.rows.filter(
    (row) => !needle || row.title.toLowerCase().includes(needle),
  );
  const lists = Object.fromEntries(
    TABS.map((tab) => [tab, matching.filter((row) => row.state === tab)]),
  ) as Record<(typeof TABS)[number], Row[]>;
  const classFacet: Facet = {
    id: "class",
    label: m.lrnClass(),
    single: true,
    options: classChoices(data.classes),
    selected: search.classId ? [search.classId] : [],
    onChange: ([next = ""]) => patch({ classId: next }),
  };
  const toolbar: IndexToolbarProps = {
    search: {
      value: search.q,
      onChange: (q) => patch({ q }),
      label: m.lrnSearchHint(),
      placeholder: m.lrnSearchPlaceholder(),
    },
    facets: data.classes.length > 1 ? [classFacet] : [],
    onReset: () => patch({ q: "", classId: "" }),
  };
  const create: HeaderAction | undefined =
    data.classes.length > 0
      ? {
          label: m.lrnNewModule(),
          icon: Plus,
          link: {
            to: "/module-editor",
            search: search.classId ? { classId: search.classId } : {},
          },
        }
      : undefined;
  const rowActions = (row: Row): RowAction[] =>
    row.state === "archived"
      ? []
      : [
          {
            label: m.lrnEditModule(),
            icon: Pencil,
            onSelect: () =>
              navigate({ to: "/module-editor", search: { id: row.id } }),
          },
        ];
  return (
    <>
      <PageHeader
        title={m.navModules()}
        description={m.lrnTeachHint()}
        action={create}
        menu={
          data.classes.length > 0
            ? [
                {
                  label: m.yearMapTitle(),
                  icon: CalendarRange,
                  onSelect: () =>
                    navigate({
                      to: "/year-map",
                      search: search.classId ? { classId: search.classId } : {},
                    }),
                },
                {
                  label: m.lrnImportCourse(),
                  icon: Import,
                  onSelect: () => setImporting(true),
                },
              ]
            : []
        }
      />
      {importing ? (
        <CartridgeImport
          open
          classes={data.classes}
          onClose={() => setImporting(false)}
        />
      ) : null}
      <RecordTabs
        label={m.lrnSections()}
        tabs={TABS.map((value) => ({
          value,
          label: `${TAB_LABEL[value]()} ${formatNumber(lists[value].length)}`,
        }))}
        value={search.tab}
        onChange={(tab) => patch({ tab })}
      >
        <DataTable
          caption={m.lrnModulesCaption()}
          rows={lists[search.tab]}
          columns={columns()}
          rowLabel={(row) => row.title}
          toolbar={toolbar}
          rowActions={rowActions}
          card={card}
          empty={{
            icon: Layers,
            title:
              data.classes.length > 0 ? m.lrnNoModules() : m.lrnNoClasses(),
            description:
              data.classes.length > 0
                ? m.lrnNoModulesBody()
                : m.lrnNoClassesBody(),
            action: create ? (
              <ButtonLink to="/module-editor" search={{}}>
                <Plus aria-hidden />
                {m.lrnNewModule()}
              </ButtonLink>
            ) : undefined,
          }}
        />
      </RecordTabs>
    </>
  );
}
