import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, CalendarDays, Plus } from "lucide-react";

import { formatDay } from "~/components/admin/format";
import { ButtonLink } from "~/components/app/ButtonLink";
import { PageHeader } from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import * as m from "~/i18n/messages";
import { academicYearsQuery } from "~/queries/academic-years";

export const Route = createFileRoute("/_app/admin/academic-years")({
  staticData: { breadcrumb: m.academicYearsTitle },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(academicYearsQuery);
  },
  component: AcademicYearsPage,
});

function AcademicYearsPage() {
  const { data: years } = useSuspenseQuery(academicYearsQuery);
  return (
    <>
      <PageHeader
        title={m.academicYearsTitle()}
        description={m.academicYearsHint()}
        actions={
          <ButtonLink to="/admin/academic-year-editor" search={{}}>
            <Plus aria-hidden />
            {m.academicYearCreate()}
          </ButtonLink>
        }
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {years.map((year) => (
          <article
            key={year.id}
            className="flex flex-col gap-5 rounded-xl border bg-card p-6"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <CalendarDays aria-hidden />
              </div>
              {year.isCurrent ? (
                <Badge variant="secondary">{m.academicYearDefault()}</Badge>
              ) : null}
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {year.name}
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{m.adminStartsOn()}</dt>
                  <dd className="mt-1">{formatDay(year.startsOn)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{m.adminEndsOn()}</dt>
                  <dd className="mt-1">{formatDay(year.endsOn)}</dd>
                </div>
              </dl>
            </div>
            <ButtonLink
              to="/admin/academic-year-editor"
              search={{ id: year.id }}
              variant="outline"
              className="mt-auto justify-between"
            >
              {m.managementEditNamed({ name: year.name })}
              <ArrowUpRight className="rtl:-scale-x-100" aria-hidden />
            </ButtonLink>
          </article>
        ))}
      </div>
    </>
  );
}
