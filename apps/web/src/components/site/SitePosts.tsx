import type { PostsQuery, PostTab } from "@faridalms/domain/website";

import { POST_TABS } from "@faridalms/domain/website";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Archive, EyeOff, Newspaper, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import type { Column, RowAction } from "~/components/system/DataTable";
import type { Facet, IndexToolbarProps } from "~/components/system/IndexPage";

import { ButtonLink } from "~/components/app/ButtonLink";
import { Value } from "~/components/app/primitives";
import { formatInstant } from "~/components/coursework/format";
import { DataTable, RowLink } from "~/components/system/DataTable";
import { StatusText } from "~/components/system/status";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { siteOverviewQuery, sitePostsQuery } from "~/queries/site";
import { archiveSitePost, unpublishSitePost } from "~/server/site";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { ShownState } from "./format";

import { STATE_LABEL, STATE_TONE } from "./format";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof sitePostsQuery>["queryFn"]>>
>;
type Row = Data["rows"][number];

const TAB_STATE: Record<PostTab, ShownState> = {
  published: "published",
  scheduled: "scheduled",
  drafts: "draft",
  archived: "archived",
};

const TAB_LABEL: Record<PostTab, () => string> = {
  published: m.siteTabPublished,
  scheduled: m.siteTabScheduled,
  drafts: m.siteTabDrafts,
  archived: m.siteTabArchived,
};

const title = (row: Row) => inLocale(row.titleEn || null, row.titleAr || null);

function Title({ row }: { row: Row }) {
  return (
    <RowLink to="/admin/site-post-editor" search={{ id: row.id }}>
      {row.pinned ? `${title(row)} · ${m.sitePinned()}` : title(row)}
    </RowLink>
  );
}

function columns(
  tab: PostTab,
  categories: Map<string, string>,
  timeZone: string,
): Column<Row>[] {
  return [
    {
      id: "title",
      header: m.sitePostTitle(),
      primary: true,
      cell: (row) => <Title row={row} />,
    },
    {
      id: "category",
      header: m.siteCategory(),
      cell: (row) => (
        <Value>
          {row.categoryId ? (categories.get(row.categoryId) ?? null) : null}
        </Value>
      ),
    },
    {
      id: "state",
      header: m.siteState(),
      cell: () => (
        <StatusText tone={STATE_TONE[TAB_STATE[tab]]}>
          {STATE_LABEL[TAB_STATE[tab]]()}
        </StatusText>
      ),
    },
    {
      id: "when",
      header: m.siteWhen(),
      cell: (row) => (
        <Value>
          {row.publishedAt ? formatInstant(row.publishedAt, timeZone) : null}
        </Value>
      ),
    },
  ];
}

const postCard = (timeZone: string) => ({
  title: (row: Row) => <Title row={row} />,
  fact: (row: Row) =>
    row.publishedAt ? formatInstant(row.publishedAt, timeZone) : null,
});

/** The school's news posts, a tab per state, searchable by title. */
export function SitePosts({
  search,
  onSearch,
}: {
  search: PostsQuery;
  onSearch: (change: Partial<PostsQuery>) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const data = useSuspenseQuery(sitePostsQuery(search)).data;
  const overview = useSuspenseQuery(siteOverviewQuery).data;
  const categories = new Map(
    overview.categories.map((row) => [
      row.id,
      inLocale(row.nameEn || null, row.nameAr || null),
    ]),
  );
  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["site"] });
      toast.success(done);
    } catch (error) {
      toast.error(getMessageFromError(error));
    }
  };
  const tabFacet: Facet = {
    id: "state",
    label: m.siteState(),
    single: true,
    options: POST_TABS.map((tab) => ({
      value: tab,
      label: `${TAB_LABEL[tab]()} ${formatNumber(data.counts[tab])}`,
    })),
    selected: [search.tab],
    defaultSelected: ["published"],
    onChange: ([next]) =>
      onSearch({ tab: (next as PostTab | undefined) ?? "published" }),
  };
  const toolbar: IndexToolbarProps = {
    search: {
      value: search.q,
      onChange: (q) => onSearch({ q }),
      label: m.sitePostSearch(),
      placeholder: m.sitePostSearchPlaceholder(),
    },
    facets: [tabFacet],
    onReset: () => onSearch({ q: "", tab: "published" }),
  };
  const rowActions = (row: Row): RowAction[] => [
    {
      label: m.siteEditPost(),
      icon: Pencil,
      inline: true,
      onSelect: () =>
        navigate({ to: "/admin/site-post-editor", search: { id: row.id } }),
    },
    ...(row.state === "published"
      ? [
          {
            label: m.siteUnpublish(),
            icon: EyeOff,
            onSelect: () =>
              run(
                () =>
                  unpublishSitePost({
                    data: { id: row.id, expectedVersion: row.version },
                  }),
                m.siteUnpublished(),
              ),
          },
        ]
      : []),
    ...(row.state !== "archived"
      ? [
          {
            label: m.siteArchive(),
            icon: Archive,
            onSelect: () =>
              run(
                () =>
                  archiveSitePost({
                    data: { id: row.id, expectedVersion: row.version },
                  }),
                m.siteArchived(),
              ),
          },
        ]
      : []),
  ];
  const create = (
    <ButtonLink to="/admin/site-post-editor" search={{}}>
      <Plus aria-hidden />
      {m.siteNewPost()}
    </ButtonLink>
  );
  return (
    <div className="grid gap-4">
      <div className="flex justify-end">{create}</div>
      <DataTable
        caption={m.sitePostsCaption()}
        rows={data.rows}
        columns={columns(search.tab, categories, user.school.timeZone)}
        rowLabel={title}
        toolbar={toolbar}
        rowActions={rowActions}
        card={postCard(user.school.timeZone)}
        empty={{
          icon: Newspaper,
          title: m.siteNoPosts(),
          description: m.siteNoPostsBody(),
        }}
      />
    </div>
  );
}
