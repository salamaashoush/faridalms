import type { ManageNewsQuery, NewsListQuery } from "@faridalms/domain/news";

import { NEWS_PAGE, NEWS_SORTS, NEWS_TABS } from "@faridalms/domain/news";
import { cn } from "@faridalms/ui/cn";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { CircleCheck, Newspaper, Plus } from "lucide-react";
import * as v from "valibot";

import type { Column, SortDirection } from "~/components/system/DataTable";

import {
  DataTable,
  Pagination,
  RowLink,
  ViewMenu,
} from "~/components/system/DataTable";
import {
  EmptyState,
  IndexToolbar,
  PageHeader,
} from "~/components/system/IndexPage";
import { RecordTabs } from "~/components/system/RecordPage";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { managedNewsQuery, newsQuery } from "~/queries/news";
import { currentUserQuery } from "~/queries/user";
import { formatInstant, formatNumber } from "~/utils/datetime";

const TABS = ["latest", ...NEWS_TABS] as const;
type Tab = (typeof TABS)[number];

const searchSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(TABS), "latest"), "latest"),
  q: v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
  sort: v.fallback(v.optional(v.picklist(NEWS_SORTS), "date"), "date"),
  dir: v.fallback(v.optional(v.picklist(["asc", "desc"]), "desc"), "desc"),
  page: v.fallback(
    v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    1,
  ),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});
type NewsSearch = v.InferOutput<typeof searchSchema>;

const NO_COLUMNS: ReadonlySet<string> = new Set();

const isManage = (tab: Tab): tab is ManageNewsQuery["tab"] =>
  (NEWS_TABS as readonly string[]).includes(tab);

const latestOf = (search: NewsSearch): NewsListQuery => ({
  q: search.q,
  sort: search.sort,
  direction: search.dir,
  page: search.page,
  locale: getLocale(),
});

export const Route = createFileRoute("/_app/news/")({
  staticData: { breadcrumb: m.newsTitle },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const { queryClient } = context;
    const user = await queryClient.ensureQueryData(currentUserQuery);
    if (isManage(deps.tab) && user.capabilities.includes("news:manage"))
      await queryClient.ensureQueryData(
        managedNewsQuery({ tab: deps.tab, q: deps.q }),
      );
    else await queryClient.ensureQueryData(newsQuery(latestOf(deps)));
  },
  component: NewsPage,
});

const TAB_LABEL: Record<Tab, () => string> = {
  latest: m.newsTabLatest,
  drafts: m.annTabDrafts,
  scheduled: m.annTabScheduled,
  published: m.annTabSent,
  archived: m.annTabArchived,
};

type NewsRow = Awaited<
  ReturnType<NonNullable<ReturnType<typeof newsQuery>["queryFn"]>>
>["rows"][number];
type ManagedRow = Awaited<
  ReturnType<NonNullable<ReturnType<typeof managedNewsQuery>["queryFn"]>>
>["rows"][number];

const titleOf = (row: { titleEn: string; titleAr: string }) =>
  inLocale(row.titleEn || null, row.titleAr || null);

function NewsItem({ row }: { row: NewsRow }) {
  const unread = row.recipient && row.readAt === null;
  const summary =
    inLocale(row.excerptEn || null, row.excerptAr || null) || row.summary;
  return (
    <li className="grid gap-1.5 py-4">
      <Link
        to="/news/$postId"
        params={{ postId: row.id }}
        className={cn(
          "min-w-0 text-base leading-6 hover:text-primary hover:underline",
          unread ? "font-semibold" : "font-medium",
        )}
      >
        <bdi>{titleOf(row)}</bdi>
        {unread ? <span className="sr-only"> {m.annUnread()}</span> : null}
      </Link>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {[
          row.publishAt ? formatInstant(row.publishAt) : null,
          inLocale(row.authorNameEn, row.authorNameAr),
          row.visibility === "public" ? m.newsWebsite() : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {summary ? (
        <p
          dir="auto"
          className="line-clamp-2 text-sm leading-5 text-foreground/90"
        >
          {summary.replaceAll(/\s*\n+\s*/g, " · ")}
        </p>
      ) : null}
    </li>
  );
}

function Latest({
  search,
  onPage,
}: {
  search: NewsSearch;
  onPage: (page: number) => void;
}) {
  const { rows, page, pages, total } = useSuspenseQuery(
    newsQuery(latestOf(search)),
  ).data;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={Newspaper}
        title={search.q ? m.newsNoMatch() : m.newsNothing()}
        description={m.newsNothingBody()}
      />
    );
  return (
    <div className="grid gap-4">
      <ul
        className="divide-y rounded-lg border bg-card px-5"
        aria-label={m.newsTitle()}
      >
        {rows.map((row) => (
          <NewsItem key={row.id} row={row} />
        ))}
      </ul>
      {pages > 1 ? (
        <Pagination
          page={page}
          pages={pages}
          total={total}
          pageSize={NEWS_PAGE}
          onPage={onPage}
        />
      ) : null}
    </div>
  );
}

function ManagedTitle({ row }: { row: ManagedRow }) {
  return row.state === "draft" ? (
    <RowLink to="/news-editor" search={{ id: row.id }}>
      {titleOf(row)}
    </RowLink>
  ) : (
    <RowLink to="/news/$postId" params={{ postId: row.id }}>
      {titleOf(row)}
    </RowLink>
  );
}

function reach(row: ManagedRow) {
  if (row.recipients === 0) return "–";
  return m.annReadOf({
    count: formatNumber(row.read),
    total: formatNumber(row.recipients),
  });
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function managedColumns(): Column<ManagedRow>[] {
  return [
    {
      id: "title",
      header: m.annColTitle(),
      primary: true,
      cell: (row) => <ManagedTitle row={row} />,
    },
    {
      id: "where",
      header: m.newsColWhere(),
      cell: (row) =>
        row.visibility === "public" ? m.newsWherePublic() : m.newsSchoolOnly(),
    },
    {
      id: "when",
      header: m.annColWhen(),
      cell: (row) => (row.publishAt ? formatInstant(row.publishAt) : "–"),
    },
    { id: "reach", header: m.annColReach(), cell: (row) => reach(row) },
  ];
}

const managedCard = {
  title: (row: ManagedRow) => <ManagedTitle row={row} />,
  fact: (row: ManagedRow) => reach(row),
};

function Managed({ tab, q }: { tab: ManageNewsQuery["tab"]; q: string }) {
  const { rows } = useSuspenseQuery(managedNewsQuery({ tab, q })).data;
  return (
    <DataTable
      caption={m.newsManagedCaption()}
      rows={rows}
      columns={managedColumns()}
      rowLabel={(row) => titleOf(row)}
      card={managedCard}
      empty={{
        icon: CircleCheck,
        title: m.newsManagedEmpty(),
        description: m.newsManagedEmptyBody(),
      }}
    />
  );
}

function NewsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const manages = user.capabilities.includes("news:manage");
  const tab = manages ? search.tab : "latest";
  const body = (
    <div className="grid gap-4">
      <IndexToolbar
        search={{
          value: search.q,
          onChange: (q) =>
            void navigate({
              search: (previous) => ({ ...previous, q, page: 1 }),
            }),
          label: m.newsSearch(),
          placeholder: m.newsSearchPlaceholder(),
        }}
        view={
          isManage(tab) ? undefined : (
            <ViewMenu
              sort={{
                value: search.sort,
                direction: search.dir,
                onChange: (sort, dir: SortDirection) =>
                  void navigate({
                    search: (previous) => ({ ...previous, sort, dir, page: 1 }),
                  }),
              }}
              sortOptions={[
                { value: "date", label: m.newsSortDate() },
                { value: "title", label: m.newsSortTitle() },
              ]}
              columns={[]}
              hidden={NO_COLUMNS}
              onToggle={() => undefined}
            />
          )
        }
      />
      {isManage(tab) ? (
        <Managed tab={tab} q={search.q} />
      ) : (
        <Latest
          search={search}
          onPage={(page) =>
            void navigate({ search: (previous) => ({ ...previous, page }) })
          }
        />
      )}
    </div>
  );
  return (
    <>
      <PageHeader
        title={m.newsTitle()}
        description={m.newsHint()}
        action={
          manages
            ? {
                label: m.newsNew(),
                icon: Plus,
                link: { to: "/news-editor", search: {} },
              }
            : undefined
        }
      />
      {manages ? (
        <RecordTabs
          label={m.newsTitle()}
          tabs={TABS.map((value) => ({ value, label: TAB_LABEL[value]() }))}
          value={search.tab}
          onChange={(next) => void navigate({ search: { tab: next } })}
        >
          {body}
        </RecordTabs>
      ) : (
        body
      )}
    </>
  );
}
