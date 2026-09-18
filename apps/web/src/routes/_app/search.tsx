import { SEARCH_KINDS, searchableKinds } from "@faridalms/domain/search";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import { EmptyState, PageHeader } from "~/components/app/primitives";
import {
  SEARCH_KIND_LABEL,
  SearchResults,
} from "~/components/app/SearchResults";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { searchQuery } from "~/queries/search";

const TABS = ["all", ...SEARCH_KINDS] as const;

export const Route = createFileRoute("/_app/search")({
  staticData: { breadcrumb: m.searchResultsTitle },
  validateSearch: v.object({
    q: v.optional(v.pipe(v.string(), v.maxLength(100)), ""),
    kind: v.optional(v.picklist(TABS), "all"),
    page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (deps.q.trim())
      await context.queryClient.ensureQueryData(
        searchQuery({ ...deps, q: deps.q.trim() }),
      );
  },
  component: SearchPage,
});

function SearchPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const [draft, setDraft] = useState(search.q);
  const q = search.q.trim();
  const kinds = searchableKinds(user.permissions);
  const results = useQuery({
    ...searchQuery({ q, kind: search.kind, page: search.page }),
    enabled: q.length > 0,
  });
  const groups = results.data?.groups ?? [];
  return (
    <>
      <PageHeader
        title={m.searchResultsTitle()}
        description={m.searchResultsHint()}
      />
      <search>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void navigate({
              search: { q: draft.trim(), kind: search.kind, page: 1 },
            });
          }}
        >
          <Input
            type="search"
            aria-label={m.searchQueryLabel()}
            value={draft}
            maxLength={100}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit">{m.searchSubmit()}</Button>
        </form>
      </search>
      <Tabs
        value={search.kind}
        onValueChange={(value) => {
          const kind = TABS.find((item) => item === value);
          if (kind) void navigate({ search: { q, kind, page: 1 } });
        }}
        className="gap-6"
      >
        <TabsList>
          <TabsTrigger value="all">{m.searchAllKinds()}</TabsTrigger>
          {kinds.map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {SEARCH_KIND_LABEL[kind]()}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {q.length === 0 ? (
        <EmptyState icon={SearchX} title={m.searchTypeToSearch()} />
      ) : results.isPending ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {m.searchLoading()}
        </p>
      ) : results.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {m.searchFailed()}
        </p>
      ) : groups.length === 0 ? (
        <EmptyState icon={SearchX} title={m.searchNoResults({ q })} />
      ) : (
        <div className="rounded-xl border bg-card p-3">
          <SearchResults groups={groups} q={q} />
        </div>
      )}
      {results.data && search.kind !== "all" && results.data.pages > 1 ? (
        <nav
          aria-label={m.searchResultsTitle()}
          className="flex items-center justify-between text-sm"
        >
          <Link
            to="/search"
            search={{
              q,
              kind: search.kind,
              page: Math.max(1, results.data.page - 1),
            }}
            disabled={results.data.page <= 1}
            className="rounded-md border px-3 py-1.5 aria-disabled:opacity-50"
          >
            {m.paginationPrevious()}
          </Link>
          <span className="text-muted-foreground">
            {results.data.page} / {results.data.pages}
          </span>
          <Link
            to="/search"
            search={{
              q,
              kind: search.kind,
              page: Math.min(results.data.pages, results.data.page + 1),
            }}
            disabled={results.data.page >= results.data.pages}
            className="rounded-md border px-3 py-1.5 aria-disabled:opacity-50"
          >
            {m.paginationNext()}
          </Link>
        </nav>
      ) : null}
    </>
  );
}
