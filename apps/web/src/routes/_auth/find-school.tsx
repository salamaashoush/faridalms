import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import { Field, FieldGroup, FieldLabel } from "~/components/app/field";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { schoolFinderQuery } from "~/queries/portal";
import { hostHref } from "~/utils/host";

const searchSchema = v.object({
  q: v.fallback(
    v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80))),
    undefined,
  ),
});

export const Route = createFileRoute("/_auth/find-school")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ q: search.q ?? "" }),
  beforeLoad: ({ context }) => {
    // A school's own portal already names its school.
    if (context.auth.schoolFromHost) throw redirect({ to: "/sign-in" });
  },
  loader: ({ context, deps }) =>
    deps.q
      ? context.queryClient.ensureQueryData(schoolFinderQuery(deps.q))
      : null,
  head: () => ({ meta: [{ title: m.finderTitle() }] }),
  component: FindSchoolPage,
});

function Results({ query }: { query: string }) {
  const found = useSuspenseQuery(schoolFinderQuery(query)).data;
  const other = getLocale() === "ar" ? "en" : "ar";
  if (found.limited)
    return (
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {m.finderTooMany()}
      </p>
    );
  if (found.schools.length === 0)
    return (
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {m.finderNone({ query })}
      </p>
    );
  return (
    <section aria-labelledby="finder-results" className="grid gap-3">
      <h2
        id="finder-results"
        aria-live="polite"
        className="text-sm font-medium"
      >
        {m.finderFound({ count: found.schools.length })}
      </h2>
      <ul className="grid gap-2">
        {found.schools.map((school) => {
          const name = inLocale(school.nameEn, school.nameAr);
          const otherName = other === "ar" ? school.nameAr : school.nameEn;
          return (
            <li key={school.slug}>
              <a
                href={hostHref(school.portalHost, "/sign-in")}
                className="flex min-h-14 items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span dir="auto" className="truncate font-medium">
                    {name}
                  </span>
                  {otherName && otherName !== name ? (
                    <span
                      lang={other}
                      dir="auto"
                      className="truncate text-[13px] text-muted-foreground"
                    >
                      {otherName}
                    </span>
                  ) : null}
                  <span
                    dir="ltr"
                    className="truncate text-start text-[13px] text-muted-foreground"
                  >
                    {school.portalHost}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
                />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The school finder on the bare portal domain, for someone who does not
 * know their school's code: they search by name in either language and go
 * to their school's own portal, where sign-in no longer asks for a code.
 * The search sits in the address, so it works before the page hydrates and
 * a link to it opens the same answers.
 */
function FindSchoolPage() {
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [query, setQuery] = useState(q ?? "");
  return (
    <div className="grid gap-8">
      <div>
        <h1 className="mb-2 text-[32px] leading-10 font-semibold text-foreground">
          {m.finderTitle()}
        </h1>
        <p className="text-muted-foreground">{m.finderBody()}</p>
      </div>
      <search>
        <form
          method="get"
          onSubmit={(event) => {
            event.preventDefault();
            const next = query.trim();
            void navigate({ search: { q: next || undefined } });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="finder-query">{m.finderLabel()}</FieldLabel>
              <Input
                id="finder-query"
                name="q"
                type="search"
                dir="auto"
                autoComplete="organization"
                maxLength={80}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </Field>
            <Button type="submit" className="w-full">
              <Search aria-hidden />
              {m.finderSubmit()}
            </Button>
          </FieldGroup>
        </form>
      </search>
      {q ? <Results query={q} /> : null}
      <Link
        to="/sign-in"
        className="justify-self-center text-sm text-primary underline-offset-4 hover:underline"
      >
        {m.forgotBack()}
      </Link>
    </div>
  );
}
