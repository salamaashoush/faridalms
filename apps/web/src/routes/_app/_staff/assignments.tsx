import type { TeacherTab } from "@faridalms/domain/coursework";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type {
  Facet,
  IndexToolbarProps,
} from "@faridalms/ui/system/index-toolbar";
import type { HeaderAction } from "@faridalms/ui/system/page-header";

import {
  TEACHER_TABS,
  teacherListSearchSchema,
} from "@faridalms/domain/coursework";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ClipboardList, ClipboardPen, Copy, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import {
  endedFacet,
  useNarrowed,
  useViewFacets,
} from "~/components/classes/class-facets";
import { classChoices, classTitle } from "~/components/classes/format";
import { classFilters, viewsOf } from "~/components/classes/slots";
import { PHASE_LABEL, PHASE_TONE } from "~/components/coursework/format";
import { UseAgainSheet } from "~/components/coursework/UseAgain";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import {
  courseworkListQuery,
  courseworkOptionsQuery,
} from "~/queries/coursework";
import { currentUserQuery } from "~/queries/user";
import { formatInstant, formatNumber } from "~/utils/datetime";
import { filled } from "~/utils/extension";
import { requirePage } from "~/utils/page-access";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof courseworkListQuery>["queryFn"]>>
>;
type Row = Data["rows"][number];

// Loose, so a module's view of the classes rides in the address under its own key.
const searchSchema = v.looseObject(teacherListSearchSchema.entries);
type Search = v.InferOutput<typeof searchSchema>;
const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/_staff/assignments")({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "assignments:author", "submissions:grade");
    const filters = filled(context.extensions, user.modules, classFilters);
    await Promise.all([
      context.queryClient.ensureQueryData(
        courseworkListQuery({ ...deps, views: viewsOf(filters, deps) }),
      ),
      context.queryClient.ensureQueryData(courseworkOptionsQuery),
      ...filters.map((filter) =>
        context.queryClient.ensureQueryData(filter.query()),
      ),
    ]);
  },
  component: CourseworkPage,
});

const TAB_LABEL: Record<TeacherTab, () => string> = {
  to_grade: m.courseworkTabToGrade,
  assigned: m.courseworkTabAssigned,
  scheduled: m.courseworkTabScheduled,
  drafts: m.courseworkTabDrafts,
  past: m.courseworkTabPast,
};

interface TitleProps {
  row: Row;
}

function Title({ row }: TitleProps) {
  return (
    <RowLink
      to="/assignments/$assignmentId"
      params={{ assignmentId: row.id }}
      search={{}}
    >
      {row.title}
    </RowLink>
  );
}

interface PhaseProps {
  row: Row;
}

function Phase({ row }: PhaseProps) {
  return (
    <StatusText tone={PHASE_TONE[row.phase]}>
      {PHASE_LABEL[row.phase]()}
    </StatusText>
  );
}

function progress(row: Row) {
  if (row.phase === "draft") return null;
  const parts = [
    m.courseworkHandedInOf({
      count: formatNumber(row.handedIn),
      total: formatNumber(row.recipients),
    }),
  ];
  if (row.missing) parts.push(m.courseworkMissingCount({ count: row.missing }));
  if (row.toGrade) parts.push(m.courseworkToGradeCount({ count: row.toGrade }));
  return parts.join(" · ");
}

interface DueProps {
  row: Row;
}

function Due({ row }: DueProps) {
  return row.dueAt ? (
    <Value>{formatInstant(row.dueAt)}</Value>
  ) : (
    <Value absent={m.courseworkNoDueDate()} />
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function columns(): Column<Row>[] {
  return [
    {
      id: "title",
      header: m.courseworkTitle(),
      primary: true,
      cell: (row) => (
        <div className="grid min-w-0">
          <Title row={row} />
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {classTitle({
              code: row.classCode,
              titleEn: row.classTitleEn,
              titleAr: row.classTitleAr,
            })}
          </span>
        </div>
      ),
    },
    {
      id: "status",
      header: m.courseworkStatus(),
      cell: (row) => <Phase row={row} />,
    },
    {
      id: "due",
      header: m.courseworkDue(),
      cell: (row) => <Due row={row} />,
    },
    {
      id: "progress",
      header: m.courseworkProgress(),
      cell: (row) => (
        <Value notApplicable={row.phase === "draft"}>{progress(row)}</Value>
      ),
    },
  ];
}

const card = {
  title: (row: Row) => <Title row={row} />,
  status: (row: Row) => <Phase row={row} />,
  fact: (row: Row) => progress(row),
};

function CourseworkPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const views = viewsOf(useSlot(classFilters), search);
  const data = useSuspenseQuery(courseworkListQuery({ ...search, views })).data;
  const options = useSuspenseQuery(courseworkOptionsQuery).data;
  const patch = (change: Partial<Search>) => {
    void navigate({
      resetScroll: false,
      search: (previous) => ({ ...previous, ...change }),
    });
  };
  const viewFacets = useViewFacets(search, (key, value) =>
    patch({ [key]: value, classId: "" }),
  );
  const narrowed = useNarrowed(search);
  const classFacet: Facet = {
    id: "class",
    label: m.studentClass(),
    single: true,
    options: classChoices(options.classes),
    selected: search.classId ? [search.classId] : [],
    onChange: ([next = ""]) => patch({ classId: next }),
  };
  const toolbar: IndexToolbarProps = {
    search: {
      value: search.q,
      onChange: (q) => patch({ q }),
      label: m.courseworkSearchHint(),
      placeholder: m.courseworkSearchPlaceholder(),
    },
    facets: [
      ...viewFacets,
      ...(narrowed
        ? []
        : [endedFacet(search.ended, (ended) => patch({ ended }))]),
      classFacet,
    ],
    onReset: () =>
      patch({
        q: "",
        classId: "",
        ended: false,
        ...Object.fromEntries(
          Object.keys(views).map((key) => [key, undefined]),
        ),
      }),
  };
  const [reusing, setReusing] = useState<{
    source: { id: string; title: string } | null;
    key: number;
    open: boolean;
  }>();
  const reuse = (source: { id: string; title: string } | null) =>
    setReusing((current) => ({
      source,
      key: (current?.key ?? 0) + 1,
      open: true,
    }));
  const create: HeaderAction | undefined =
    options.classes.length > 0
      ? {
          label: m.courseworkNew(),
          icon: Plus,
          link: { to: "/assignment-editor", search: {} },
        }
      : undefined;
  const rowActions = (row: Row): RowAction[] => [
    ...(row.toGrade > 0
      ? [
          {
            label: m.courseworkGrade(),
            icon: ClipboardPen,
            inline: true,
            onSelect: () =>
              navigate({
                to: "/assignments/$assignmentId",
                params: { assignmentId: row.id },
                search: { tab: "work" },
              }),
          },
        ]
      : []),
    ...(row.phase !== "archived"
      ? [
          {
            label: m.courseworkEdit(),
            icon: Pencil,
            onSelect: () =>
              navigate({
                to: "/assignment-editor",
                search: { id: row.id },
              }),
          },
        ]
      : []),
    ...(options.classes.length > 0
      ? [
          {
            label: m.courseworkUseAgain(),
            icon: Copy,
            onSelect: () => reuse({ id: row.id, title: row.title }),
          },
        ]
      : []),
  ];
  return (
    <Page width="list">
      <PageHeader
        title={m.courseworkTitlePage()}
        description={m.courseworkHint()}
        action={create}
        menu={
          options.classes.length > 0
            ? [
                {
                  label: m.courseworkUseAgainTitle(),
                  icon: Copy,
                  onSelect: () => reuse(null),
                },
              ]
            : []
        }
      />
      <RecordTabs
        label={m.courseworkSections()}
        tabs={TEACHER_TABS.map((value) => ({
          value,
          label: `${TAB_LABEL[value]()} ${formatNumber(data.counts[value])}`,
        }))}
        value={search.tab}
        onChange={(tab) => patch({ tab })}
      >
        <DataTable
          caption={m.courseworkCaption()}
          rows={data.rows}
          columns={columns()}
          rowLabel={(row) => row.title}
          toolbar={toolbar}
          rowActions={rowActions}
          card={card}
          empty={{
            icon: ClipboardList,
            title: m.courseworkEmptyTitle(),
            description: m.courseworkEmptyBody(),
            action: create ? (
              <ButtonLink to="/assignment-editor" search={{}}>
                <Plus aria-hidden />
                {m.courseworkNew()}
              </ButtonLink>
            ) : undefined,
          }}
        />
      </RecordTabs>
      {reusing ? (
        <UseAgainSheet
          key={reusing.key}
          source={reusing.source}
          classId={search.classId}
          open={reusing.open}
          onClose={() =>
            setReusing((current) => current && { ...current, open: false })
          }
        />
      ) : null}
    </Page>
  );
}
