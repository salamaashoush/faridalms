import type {
  EnquiryListQuery,
  EnquiryView,
} from "@faridalms/domain/enquiries";
import type { Column } from "@faridalms/ui/system/data-table";

import {
  ENQUIRY_PURPOSES,
  ENQUIRY_SOURCES,
  ENQUIRY_STATES,
  enquiryListSchema,
} from "@faridalms/domain/enquiries";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Inbox, Plus } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import { LogEnquirySheet } from "~/components/admissions/EnquirySheets";
import {
  PURPOSE_LABEL,
  SOURCE_LABEL,
  STATE_LABEL,
  STATE_TONE,
} from "~/components/admissions/labels";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { enquiriesQuery } from "~/queries/admissions";
import { currentUserQuery } from "~/queries/user";
import { formatInstant, formatNumber } from "~/utils/datetime";
import { requirePage } from "~/utils/page-access";

const DEFAULT_SEARCH = v.parse(enquiryListSchema, {});

export const Route = createFileRoute("/_app/admissions/enquiries/")({
  staticData: { breadcrumb: m.admTitle },
  validateSearch: enquiryListSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "admissions:read", "admissions:manage");
    await context.queryClient.ensureQueryData(enquiriesQuery(deps));
  },
  component: EnquiriesPage,
});

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof enquiriesQuery>["queryFn"]>>
>;
type Row = Data["rows"][number];

interface FamilyProps {
  row: Row;
}

function Family({ row }: FamilyProps) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <RowLink
        to="/admissions/enquiries/$enquiryId"
        params={{ enquiryId: row.id }}
        className="justify-self-start"
      >
        {row.name}
      </RowLink>
      <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
        <bdi dir="ltr">{row.email || row.phone}</bdi>
      </span>
    </span>
  );
}

interface AboutProps {
  row: Row;
}

function About({ row }: AboutProps) {
  const child = [row.childName, row.childYear].filter(Boolean).join(" · ");
  return (
    <span className="grid min-w-0 gap-0.5">
      <span className="text-sm">{PURPOSE_LABEL[row.purpose]()}</span>
      {child || row.preview ? (
        <span
          dir="auto"
          className="line-clamp-1 text-[13px] leading-[18px] text-muted-foreground"
        >
          {child || row.preview}
        </span>
      ) : null}
    </span>
  );
}

interface StateProps {
  row: Row;
}

const State = ({ row }: StateProps) => (
  <StatusText tone={STATE_TONE[row.state]}>
    {STATE_LABEL[row.state]()}
  </StatusText>
);

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function columns(): Column<Row>[] {
  return [
    {
      id: "family",
      header: m.admColFamily(),
      primary: true,
      cell: (row) => <Family row={row} />,
    },
    {
      id: "about",
      header: m.admColAbout(),
      cell: (row) => <About row={row} />,
    },
    {
      id: "source",
      header: m.admColSource(),
      cell: (row) => SOURCE_LABEL[row.source](),
    },
    {
      id: "assignee",
      header: m.admColAssignee(),
      cell: (row) =>
        row.assignee ? (
          <bdi>{inLocale(row.assignee.nameEn, row.assignee.nameAr)}</bdi>
        ) : (
          <Value absent={m.admNobody()} />
        ),
    },
    {
      id: "received",
      header: m.admColReceived(),
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatInstant(row.createdAt)}
        </span>
      ),
    },
    {
      id: "state",
      header: m.admColState(),
      cell: (row) => <State row={row} />,
    },
  ];
}

const card = () => ({
  title: (row: Row) => <Family row={row} />,
  status: (row: Row) => <State row={row} />,
  fact: (row: Row) =>
    `${PURPOSE_LABEL[row.purpose]()} · ${SOURCE_LABEL[row.source]()} · ${formatInstant(row.createdAt)}`,
});

const VIEW_LABEL: Record<EnquiryView, () => string> = {
  all: m.admViewAll,
  ...STATE_LABEL,
};

function EnquiriesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const data = useSuspenseQuery(enquiriesQuery(search)).data;
  const [logging, setLogging] = useState(false);
  const update = (next: Partial<EnquiryListQuery>) =>
    void navigate({
      search: (previous) => ({ ...previous, page: 1, ...next }),
    });
  const views: EnquiryView[] = [...ENQUIRY_STATES, "all"];
  const total = Object.values(data.counts).reduce((sum, n) => sum + n, 0);
  return (
    <>
      <PageHeader
        title={m.admTitle()}
        count={search.q ? undefined : total}
        description={m.admHint()}
        action={
          data.manages
            ? {
                label: m.admLogAction(),
                icon: Plus,
                onClick: () => setLogging(true),
              }
            : undefined
        }
      />
      <RecordTabs
        label={m.admViews()}
        tabs={views.map((value) => ({
          value,
          label:
            value === "all"
              ? VIEW_LABEL[value]()
              : m.admViewCount({
                  view: VIEW_LABEL[value](),
                  count: formatNumber(data.counts[value]),
                }),
        }))}
        value={search.state}
        onChange={(state) => update({ state })}
      >
        <div className="grid gap-4">
          <IndexToolbar
            search={{
              value: search.q,
              onChange: (q) => update({ q }),
              label: m.admSearch(),
              placeholder: m.admSearchPlaceholder(),
            }}
            facets={[
              {
                id: "source",
                label: m.admColSource(),
                single: true,
                defaultSelected: ["all"],
                selected: [search.source],
                options: [
                  { value: "all", label: m.admAnySource() },
                  ...ENQUIRY_SOURCES.map((value) => ({
                    value,
                    label: SOURCE_LABEL[value](),
                  })),
                ],
                onChange: ([source]) =>
                  update({
                    source: (source ?? "all") as EnquiryListQuery["source"],
                  }),
              },
              {
                id: "purpose",
                label: m.admFieldPurpose(),
                single: true,
                defaultSelected: ["all"],
                selected: [search.purpose],
                options: [
                  { value: "all", label: m.admAnyPurpose() },
                  ...ENQUIRY_PURPOSES.map((value) => ({
                    value,
                    label: PURPOSE_LABEL[value](),
                  })),
                ],
                onChange: ([purpose]) =>
                  update({
                    purpose: (purpose ?? "all") as EnquiryListQuery["purpose"],
                  }),
              },
              {
                id: "assignee",
                label: m.admColAssignee(),
                single: true,
                defaultSelected: ["all"],
                selected: [search.assignee],
                options: [
                  { value: "all", label: m.admAnyone() },
                  { value: "me", label: m.admMine() },
                  { value: "none", label: m.admNobody() },
                  ...data.staff
                    .filter((row) => row.id !== user.id)
                    .map((row) => ({
                      value: row.id,
                      label: inLocale(row.nameEn, row.nameAr),
                    })),
                ],
                onChange: ([assignee]) =>
                  update({ assignee: assignee ?? "all" }),
              },
            ]}
            onReset={() => void navigate({ search: { state: search.state } })}
          />
          <DataTable
            caption={m.admCaption({ view: VIEW_LABEL[search.state]() })}
            rows={data.rows}
            columns={columns()}
            rowLabel={(row) => row.name}
            card={card()}
            pagination={{
              page: data.page,
              pages: data.pages,
              total: data.total,
              pageSize: data.pageSize,
              onPage: (page) =>
                void navigate({
                  search: (previous) => ({ ...previous, page }),
                }),
            }}
            empty={{
              icon: Inbox,
              title: m.admEmpty({ view: VIEW_LABEL[search.state]() }),
              description: m.admEmptyBody(),
            }}
          />
        </div>
      </RecordTabs>
      {data.manages ? (
        <LogEnquirySheet
          open={logging}
          onOpenChange={setLogging}
          staff={data.staff}
        />
      ) : null}
    </>
  );
}
