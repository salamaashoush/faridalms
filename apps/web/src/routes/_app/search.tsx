import type { SearchKind } from "@faridalms/domain/search";

import { wordOn } from "@faridalms/domain/modules";
import { SEARCH_KINDS, searchableKinds } from "@faridalms/domain/search";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle, Search, SearchX } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import { SearchResults, useSearchKinds } from "~/components/app/SearchResults";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { searchKindQuery, searchQuery } from "~/queries/search";

const TABS = ["all", ...SEARCH_KINDS] as const;

export const Route = createFileRoute("/_app/search")({
  staticData: { breadcrumb: m.searchResultsTitle },
  validateSearch: v.object({
    q: v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
    kind: v.optional(v.picklist(TABS), "all"),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const q = deps.q.trim();
    if (!q) return;
    if (deps.kind === "all")
      await context.queryClient.ensureQueryData(searchQuery(q));
    else
      await context.queryClient.ensureInfiniteQueryData(
        searchKindQuery(q, deps.kind),
      );
  },
  component: SearchPage,
});

interface NothingProps {
  q: string;
}

function Nothing({ q }: NothingProps) {
  return (
    <EmptyState
      icon={SearchX}
      title={m.searchNothing({ q })}
      description={m.searchNothingTips()}
    />
  );
}

interface AllKindsProps {
  q: string;
}

function AllKinds({ q }: AllKindsProps) {
  const results = useQuery(searchQuery(q));
  if (results.isPending)
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {m.searchLoading()}
      </p>
    );
  if (results.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {m.searchFailed()}
      </p>
    );
  if (results.data.groups.length === 0) return <Nothing q={q} />;
  return (
    <div className="rounded-lg border bg-card p-2">
      <SearchResults groups={results.data.groups} q={q} />
    </div>
  );
}

interface OneKindProps {
  q: string;
  kind: SearchKind;
}

function OneKind({ q, kind }: OneKindProps) {
  const results = useInfiniteQuery(searchKindQuery(q, kind));
  if (results.isPending)
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {m.searchLoading()}
      </p>
    );
  if (results.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {m.searchFailed()}
      </p>
    );
  const rows = results.data.pages.flatMap((page) => page.groups[0]?.rows ?? []);
  if (rows.length === 0) return <Nothing q={q} />;
  return (
    <div className="grid justify-items-start gap-4">
      <div className="w-full rounded-lg border bg-card p-2">
        <SearchResults groups={[{ kind, rows, more: false }]} q={q} />
      </div>
      {results.hasNextPage ? (
        <Button
          variant="outline"
          className="max-md:h-10"
          disabled={results.isFetchingNextPage}
          onClick={() => void results.fetchNextPage()}
        >
          {results.isFetchingNextPage ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : null}
          {m.searchShowMore()}
        </Button>
      ) : null}
    </div>
  );
}

/** Every result the viewer may open, all kinds at a glance or one kind in full. */
function SearchPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const words = useSearchKinds();
  const [draft, setDraft] = useState(search.q);
  const q = search.q.trim();
  const kinds = searchableKinds(user.capabilities).filter((kind) =>
    wordOn("searchKinds", kind, user.modules),
  );
  const tab =
    search.kind === "all" || kinds.includes(search.kind) ? search.kind : "all";
  const choose = (kind: (typeof TABS)[number]) =>
    void navigate({ search: { q, kind } });
  return (
    <Page width="list">
      <PageHeader
        title={m.searchResultsTitle()}
        description={m.searchResultsHint()}
      />
      <search className="mb-6">
        <form
          className="flex max-w-xl gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void navigate({ search: { q: draft.trim(), kind: tab } });
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              aria-label={m.searchQueryLabel()}
              placeholder={m.searchPlaceholder()}
              value={draft}
              maxLength={100}
              enterKeyHint="search"
              className="ps-9 max-md:h-10"
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          <Button type="submit" className="max-md:h-10">
            {m.searchSubmit()}
          </Button>
        </form>
      </search>
      <RecordTabs
        label={m.searchResultsTitle()}
        tabs={[
          { value: "all" as const, label: m.searchAllKinds() },
          ...kinds.map((kind) => ({
            value: kind,
            label: words.label(kind),
          })),
        ]}
        value={tab}
        onChange={choose}
      >
        {q.length === 0 ? (
          <EmptyState icon={Search} title={m.searchTypeToSearch()} />
        ) : tab === "all" ? (
          <AllKinds q={q} />
        ) : (
          <OneKind q={q} kind={tab} />
        )}
      </RecordTabs>
    </Page>
  );
}
