import type { ManageNewslettersQuery } from "@faridalms/domain/newsletters";

import { MANAGE_TABS } from "@faridalms/domain/announcements";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  stripSearchParams,
} from "@tanstack/react-router";
import { CircleCheck, Newspaper, Plus } from "lucide-react";
import * as v from "valibot";

import type { Column } from "~/components/system/DataTable";

import { formatInstant } from "~/components/coursework/format";
import { DataTable, RowLink } from "~/components/system/DataTable";
import {
  EmptyState,
  IndexToolbar,
  PageHeader,
} from "~/components/system/IndexPage";
import { RecordTabs } from "~/components/system/RecordPage";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  managedNewslettersQuery,
  newslettersQuery,
} from "~/queries/newsletters";
import { currentUserQuery } from "~/queries/user";
import { cn } from "~/utils/cn";
import { formatNumber } from "~/utils/datetime";

const TABS = ["editions", ...MANAGE_TABS] as const;
type Tab = (typeof TABS)[number];

const searchSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(TABS), "editions"), "editions"),
  q: v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

const isManage = (tab: Tab): tab is ManageNewslettersQuery["tab"] =>
  (MANAGE_TABS as readonly string[]).includes(tab);

export const Route = createFileRoute("/_app/newsletters/")({
  staticData: { breadcrumb: m.nlTitle },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const { queryClient } = context;
    const user = await queryClient.ensureQueryData(currentUserQuery);
    if (isManage(deps.tab) && user.capabilities.includes("newsletters:manage"))
      await queryClient.ensureQueryData(
        managedNewslettersQuery({ tab: deps.tab, q: deps.q }),
      );
    else await queryClient.ensureQueryData(newslettersQuery(deps.q));
  },
  component: NewslettersPage,
});

const TAB_LABEL: Record<Tab, () => string> = {
  editions: m.nlTabEditions,
  drafts: m.annTabDrafts,
  scheduled: m.annTabScheduled,
  published: m.annTabSent,
  archived: m.annTabArchived,
};

type EditionRow = Awaited<
  ReturnType<NonNullable<ReturnType<typeof newslettersQuery>["queryFn"]>>
>["rows"][number];
type ManagedRow = Awaited<
  ReturnType<NonNullable<ReturnType<typeof managedNewslettersQuery>["queryFn"]>>
>["rows"][number];

function EditionItem({ row, timeZone }: { row: EditionRow; timeZone: string }) {
  const unread = row.readAt === null;
  return (
    <li className="grid gap-1.5 py-4">
      <Link
        to="/newsletters/$newsletterId"
        params={{ newsletterId: row.id }}
        className={cn(
          "min-w-0 text-base leading-6 hover:text-primary hover:underline",
          unread ? "font-semibold" : "font-medium",
        )}
      >
        <bdi>{row.title}</bdi>
        {unread ? <span className="sr-only"> {m.annUnread()}</span> : null}
      </Link>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {[
          row.publishAt ? formatInstant(row.publishAt, timeZone) : null,
          inLocale(row.authorNameEn, row.authorNameAr),
          row.bilingual ? m.nlBothLanguages() : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {row.summary ? (
        <p
          dir="auto"
          className="line-clamp-2 text-sm leading-5 text-foreground/90"
        >
          {row.summary.replaceAll(/\s*\n+\s*/g, " · ")}
        </p>
      ) : null}
    </li>
  );
}

function Editions({ q }: { q: string }) {
  const user = useCurrentUser();
  const { rows } = useSuspenseQuery(newslettersQuery(q)).data;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={Newspaper}
        title={q ? m.nlNoMatch() : m.nlNothing()}
        description={m.nlNothingBody()}
      />
    );
  return (
    <ul
      className="divide-y rounded-lg border bg-card px-5"
      aria-label={m.nlTitle()}
    >
      {rows.map((row) => (
        <EditionItem key={row.id} row={row} timeZone={user.school.timeZone} />
      ))}
    </ul>
  );
}

function ManagedTitle({ row }: { row: ManagedRow }) {
  return row.state === "draft" ? (
    <RowLink to="/admin/newsletter-editor" search={{ id: row.id }}>
      {row.title}
    </RowLink>
  ) : (
    <RowLink to="/newsletters/$newsletterId" params={{ newsletterId: row.id }}>
      {row.title}
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
function managedColumns(timeZone: string): Column<ManagedRow>[] {
  return [
    {
      id: "title",
      header: m.annColTitle(),
      primary: true,
      cell: (row) => <ManagedTitle row={row} />,
    },
    {
      id: "languages",
      header: m.nlColLanguages(),
      cell: (row) => (row.bilingual ? m.nlBothLanguages() : m.nlOneLanguage()),
    },
    {
      id: "when",
      header: m.annColWhen(),
      cell: (row) =>
        row.publishAt ? formatInstant(row.publishAt, timeZone) : "–",
    },
    { id: "reach", header: m.annColReach(), cell: (row) => reach(row) },
  ];
}

const managedCard = {
  title: (row: ManagedRow) => <ManagedTitle row={row} />,
  fact: (row: ManagedRow) => reach(row),
};

function Managed({
  tab,
  q,
}: {
  tab: ManageNewslettersQuery["tab"];
  q: string;
}) {
  const user = useCurrentUser();
  const { rows } = useSuspenseQuery(managedNewslettersQuery({ tab, q })).data;
  return (
    <DataTable
      caption={m.nlManagedCaption()}
      rows={rows}
      columns={managedColumns(user.school.timeZone)}
      rowLabel={(row) => row.title}
      card={managedCard}
      empty={{
        icon: CircleCheck,
        title: m.nlManagedEmpty(),
        description: m.nlManagedEmptyBody(),
      }}
    />
  );
}

function NewslettersPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const manages = user.capabilities.includes("newsletters:manage");
  const tab = manages ? search.tab : "editions";
  const body = (
    <div className="grid gap-4">
      <IndexToolbar
        search={{
          value: search.q,
          onChange: (q) =>
            void navigate({ search: (previous) => ({ ...previous, q }) }),
          label: m.nlSearch(),
          placeholder: m.nlSearchPlaceholder(),
        }}
      />
      {isManage(tab) ? (
        <Managed tab={tab} q={search.q} />
      ) : (
        <Editions q={search.q} />
      )}
    </div>
  );
  return (
    <>
      <PageHeader
        title={m.nlTitle()}
        description={m.nlHint()}
        action={
          manages
            ? {
                label: m.nlNew(),
                icon: Plus,
                link: { to: "/admin/newsletter-editor", search: {} },
              }
            : undefined
        }
      />
      {manages ? (
        <RecordTabs
          label={m.nlTitle()}
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
