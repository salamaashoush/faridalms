import type { ManageNewsQuery, NewsListQuery } from "@faridalms/domain/news";

import { NEWS_SORTS, NEWS_TABS } from "@faridalms/domain/news";
import { pageField } from "@faridalms/domain/paging";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Newspaper, Plus } from "lucide-react";
import * as v from "valibot";

import type { SortDirection } from "~/components/system/DataTable";

import {
  BroadcastItem,
  ManagedBroadcasts,
} from "~/components/broadcasts/BroadcastLists";
import { Pagination, ViewMenu } from "~/components/system/DataTable";
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

const TABS = ["latest", ...NEWS_TABS] as const;
type Tab = (typeof TABS)[number];

const searchSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(TABS), "latest"), "latest"),
  q: v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
  sort: v.fallback(v.optional(v.picklist(NEWS_SORTS), "date"), "date"),
  dir: v.fallback(v.optional(v.picklist(["asc", "desc"]), "desc"), "desc"),
  page: v.fallback(pageField, 1),
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
        managedNewsQuery({ tab: deps.tab, q: deps.q, page: deps.page }),
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

const titleOf = (row: { titleEn: string; titleAr: string }) =>
  inLocale(row.titleEn || null, row.titleAr || null);

function Latest({
  search,
  onPage,
}: {
  search: NewsSearch;
  onPage: (page: number) => void;
}) {
  const { rows, page, pages, total, pageSize } = useSuspenseQuery(
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
          <BroadcastItem
            key={row.id}
            kind="news"
            item={{
              id: row.id,
              title: titleOf(row),
              unread: row.recipient && row.readAt === null,
              pinned: false,
              urgency: "normal",
              author: inLocale(row.authorNameEn, row.authorNameAr),
              when: row.publishAt,
              website: row.visibility === "public",
              summary:
                inLocale(row.excerptEn || null, row.excerptAr || null) ||
                row.summary,
              ack: null,
            }}
          />
        ))}
      </ul>
      {pages > 1 ? (
        <Pagination
          page={page}
          pages={pages}
          total={total}
          pageSize={pageSize}
          onPage={onPage}
        />
      ) : null}
    </div>
  );
}

function NewsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const manages = user.capabilities.includes("news:manage");
  const tab = manages ? search.tab : "latest";
  const onPage = (page: number) =>
    void navigate({ search: (previous) => ({ ...previous, page }) });
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
        <ManagedBroadcasts
          kind="news"
          tab={tab}
          q={search.q}
          page={search.page}
          onPage={onPage}
        />
      ) : (
        <Latest search={search} onPage={onPage} />
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
