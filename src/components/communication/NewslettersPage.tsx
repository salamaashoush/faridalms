import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, Newspaper, Search } from "lucide-react";

import type { NewslettersQuery } from "~/schema/school";

import { EmptyState, PageHeader, Value } from "~/components/app/primitives";
import { buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import * as m from "~/i18n/messages";
import { newslettersQuery } from "~/queries/school";
import { cn } from "~/utils/cn";
import { formatDate, formatNumber } from "~/utils/datetime";

/**
 * The source data mixes `20252026` with `2025-2026`, so every row is rebuilt
 * from its digits rather than printed as stored.
 */
function formatSchoolYear(name: string): string {
  const digits = name.replaceAll(/\D/g, "");
  return digits.length === 8
    ? `${digits.slice(0, 4)}/${digits.slice(4)}`
    : name;
}

export function NewslettersPage({ search }: { search: NewslettersQuery }) {
  const navigate = useNavigate();
  const { rows } = useSuspenseQuery(newslettersQuery({ q: search.q })).data;

  const setSearch = (patch: Partial<NewslettersQuery>) => {
    void navigate({ to: ".", search: { ...search, ...patch }, replace: true });
  };

  return (
    <>
      <PageHeader
        title={m.newslettersTitle()}
        description={m.newslettersSubtitle()}
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            className="ps-9"
            value={search.q}
            aria-label={m.commNewslettersSearchLabel()}
            placeholder={m.commNewslettersSearchPlaceholder()}
            onChange={(event) => setSearch({ q: event.target.value })}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {m.commNewslettersCount({ count: formatNumber(rows.length) })}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title={m.commNewslettersEmptyTitle()}
          body={search.q ? m.commSearchEmptyBody() : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id}>
              <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-balance">
                    {row.title}
                  </h2>
                  <dl className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex gap-1.5">
                      <dt className="font-medium">
                        {m.newslettersPublished()}
                      </dt>
                      <dd>{formatDate(row.publishedOn)}</dd>
                    </div>
                    <div className="flex gap-1.5">
                      <dt className="font-medium">{m.studentSchoolYear()}</dt>
                      <dd>
                        <Value>
                          {row.schoolYear
                            ? formatSchoolYear(row.schoolYear.name)
                            : ""}
                        </Value>
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2.5 text-sm text-muted-foreground">
                    <Value>{row.summary}</Value>
                  </p>
                </div>
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "shrink-0",
                  )}
                >
                  <ExternalLink aria-hidden />
                  {m.newslettersOpen()}
                  {/* Twenty links all named "Open newsletter" give a screen
                      reader twenty identical choices. */}
                  <span className="sr-only">{row.title}</span>
                </a>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
