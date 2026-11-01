import type { ManageNewsQuery } from "@faridalms/domain/news";

import { NEWS_TABS } from "@faridalms/domain/news";
import { cn } from "@faridalms/ui/cn";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { CircleCheck, Newspaper, Plus } from "lucide-react";
import * as v from "valibot";

import type { Column } from "~/components/system/DataTable";

import { DataTable, RowLink } from "~/components/system/DataTable";
import {
  EmptyState,
  IndexToolbar,
  PageHeader,
} from "~/components/system/IndexPage";
import { RecordTabs } from "~/components/system/RecordPage";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { managedNewsQuery, newsQuery } from "~/queries/news";
import { currentUserQuery } from "~/queries/user";
import { formatInstant, formatNumber } from "~/utils/datetime";

const TABS = ["latest", ...NEWS_TABS] as const;
type Tab = (typeof TABS)[number];

const searchSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(TABS), "latest"), "latest"),
  q: v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

const isManage = (tab: Tab): tab is ManageNewsQuery["tab"] =>
  (NEWS_TABS as readonly string[]).includes(tab);

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
    else await queryClient.ensureQueryData(newsQuery(deps.q));
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
          row.publishedAt ? formatInstant(row.publishedAt) : null,
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

function Latest({ q }: { q: string }) {
  const { rows } = useSuspenseQuery(newsQuery(q)).data;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={Newspaper}
        title={q ? m.newsNoMatch() : m.newsNothing()}
        description={m.newsNothingBody()}
      />
    );
  return (
    <ul
      className="divide-y rounded-lg border bg-card px-5"
      aria-label={m.newsTitle()}
    >
      {rows.map((row) => (
        <NewsItem key={row.id} row={row} />
      ))}
    </ul>
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
      cell: (row) => (row.publishedAt ? formatInstant(row.publishedAt) : "–"),
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
            void navigate({ search: (previous) => ({ ...previous, q }) }),
          label: m.newsSearch(),
          placeholder: m.newsSearchPlaceholder(),
        }}
      />
      {isManage(tab) ? (
        <Managed tab={tab} q={search.q} />
      ) : (
        <Latest q={search.q} />
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
