import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { ButtonLink } from "~/components/app/ButtonLink";
import { PageHeader } from "~/components/app/primitives";
import * as m from "~/i18n/messages";
import {
  newsletterDraftsQuery,
  newsletterEditorContextQuery,
} from "~/queries/newsletter-drafts";
import { formatDate } from "~/utils/datetime";

export const Route = createFileRoute("/_app/admin/newsletter-drafts")({
  staticData: { breadcrumb: m.newsletterDrafts },
  validateSearch: v.object({
    year: v.optional(v.pipe(v.string(), v.uuid())),
    page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const { years } = await context.queryClient.ensureQueryData(
      newsletterEditorContextQuery,
    );
    const year = deps.year ?? years.find((item) => item.isCurrent)?.id;
    if (year)
      await context.queryClient.ensureQueryData(
        newsletterDraftsQuery(year, deps.page),
      );
  },
  component: DraftsPage,
});
function DraftsPage() {
  const { year, page } = Route.useSearch();
  const {
    data: { years },
  } = useSuspenseQuery(newsletterEditorContextQuery);
  const selected = year ?? years.find((item) => item.isCurrent)?.id;
  return (
    <>
      <PageHeader
        title={m.newsletterDrafts()}
        description={m.newsletterDraftsHint()}
        actions={
          <ButtonLink to="/admin/newsletter-editor" search={{ year: selected }}>
            {m.newsletterDesignTitle()}
          </ButtonLink>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {years.map((item) => (
          <ButtonLink
            key={item.id}
            variant={item.id === selected ? "secondary" : "outline"}
            to="/admin/newsletter-drafts"
            search={{ year: item.id, page: 1 }}
          >
            {item.name}
          </ButtonLink>
        ))}
      </div>
      {selected ? (
        <Directory year={selected} page={page} />
      ) : (
        <p>{m.academicYearNotFound()}</p>
      )}
    </>
  );
}
function Directory({ year, page }: { year: string; page: number }) {
  const { data } = useSuspenseQuery(newsletterDraftsQuery(year, page));
  return (
    <div className="rounded-xl border bg-card">
      {data.rows.length ? (
        <ul className="divide-y">
          {data.rows.map((draft) => (
            <li
              key={draft.id}
              className="flex flex-wrap items-center justify-between gap-4 p-5"
            >
              <div>
                <h2 className="font-semibold">
                  {draft.title || m.newsletterUntitledDraft()}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(draft.updatedAt.toISOString())}
                </p>
              </div>
              <ButtonLink
                variant="outline"
                to="/admin/newsletter-editor"
                search={{ id: draft.id }}
              >
                {m.managementEditNamed({
                  name: draft.title || m.newsletterUntitledDraft(),
                })}
              </ButtonLink>
            </li>
          ))}
        </ul>
      ) : (
        <p className="p-8 text-center text-muted-foreground">
          {m.messageNoDrafts()}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 border-t p-4">
        <span className="text-sm text-muted-foreground">
          {m.newsletterDraftCount({ count: data.total })}
        </span>
        <div className="flex gap-2">
          {data.page > 1 ? (
            <ButtonLink
              variant="outline"
              to="/admin/newsletter-drafts"
              search={{ year, page: data.page - 1 }}
            >
              {m.newsletterPrevious()}
            </ButtonLink>
          ) : null}
          {data.page < data.pages ? (
            <ButtonLink
              variant="outline"
              to="/admin/newsletter-drafts"
              search={{ year, page: data.page + 1 }}
            >
              {m.newsletterNext()}
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </div>
  );
}
