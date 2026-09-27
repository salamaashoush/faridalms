import type {
  TeacherListQuery,
  TeacherTab,
} from "@faridalms/domain/coursework";

import { TEACHER_TABS, teacherListSchema } from "@faridalms/domain/coursework";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ClipboardList, ClipboardPen, Pencil, Plus } from "lucide-react";
import * as v from "valibot";

import type { Column, RowAction } from "~/components/system/DataTable";
import type {
  Facet,
  HeaderAction,
  IndexToolbarProps,
} from "~/components/system/IndexPage";

import { ButtonLink } from "~/components/app/ButtonLink";
import { Value } from "~/components/app/primitives";
import { classTitle } from "~/components/classes/format";
import {
  formatInstant,
  PHASE_LABEL,
  PHASE_TONE,
} from "~/components/coursework/format";
import { DataTable, RowLink } from "~/components/system/DataTable";
import { PageHeader } from "~/components/system/IndexPage";
import { RecordTabs } from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  courseworkListQuery,
  courseworkOptionsQuery,
} from "~/queries/coursework";
import { formatNumber } from "~/utils/datetime";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof courseworkListQuery>["queryFn"]>>
>;
type Row = Data["rows"][number];

const DEFAULT_SEARCH = v.parse(teacherListSchema, {});

export const Route = createFileRoute("/_app/teach/assignments")({
  validateSearch: teacherListSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(courseworkListQuery(deps)),
      context.queryClient.ensureQueryData(courseworkOptionsQuery),
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

function Title({ row }: { row: Row }) {
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

function Phase({ row }: { row: Row }) {
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

function Due({ row, timeZone }: { row: Row; timeZone: string }) {
  return row.dueAt ? (
    <Value>{formatInstant(row.dueAt, timeZone)}</Value>
  ) : (
    <span className="text-muted-foreground">{m.courseworkNoDueDate()}</span>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function columns(timeZone: string): Column<Row>[] {
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
      cell: (row) => <Due row={row} timeZone={timeZone} />,
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
  const user = useCurrentUser();
  const data = useSuspenseQuery(courseworkListQuery(search)).data;
  const options = useSuspenseQuery(courseworkOptionsQuery).data;
  const patch = (change: Partial<TeacherListQuery>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  const classFacet: Facet = {
    id: "class",
    label: m.studentClass(),
    single: true,
    options: options.classes.map((row) => ({
      value: row.id,
      label: classTitle(row),
    })),
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
    facets: [classFacet],
    onReset: () => patch({ q: "", classId: "" }),
  };
  const create: HeaderAction | undefined =
    options.classes.length > 0
      ? {
          label: m.courseworkNew(),
          icon: Plus,
          link: { to: "/teach/assignment-editor", search: {} },
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
                to: "/teach/assignment-editor",
                search: { id: row.id },
              }),
          },
        ]
      : []),
  ];
  return (
    <>
      <PageHeader
        title={m.courseworkTitlePage()}
        description={m.courseworkHint()}
        action={create}
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
          columns={columns(user.school.timeZone)}
          rowLabel={(row) => row.title}
          toolbar={toolbar}
          rowActions={rowActions}
          card={card}
          empty={{
            icon: ClipboardList,
            title: m.courseworkEmptyTitle(),
            description: m.courseworkEmptyBody(),
            action: create ? (
              <ButtonLink to="/teach/assignment-editor" search={{}}>
                <Plus aria-hidden />
                {m.courseworkNew()}
              </ButtonLink>
            ) : undefined,
          }}
        />
      </RecordTabs>
    </>
  );
}
