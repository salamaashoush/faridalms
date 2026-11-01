import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { BreadcrumbCurrent } from "~/components/app/WorkspaceBreadcrumb";
import { yearTitle } from "~/components/years/format";
import { YEAR_TABS, YearRecord } from "~/components/years/YearRecord";
import { yearQuery, yearsQuery } from "~/queries/years";

export const Route = createFileRoute("/_app/years/$yearId")({
  staticData: {
    trail: <YearTrail />,
    section: "/admin/academic-years",
  },
  validateSearch: v.object({
    tab: v.fallback(v.optional(v.picklist(YEAR_TABS), "overview"), "overview"),
    on: v.fallback(
      v.optional(v.union([v.literal(""), v.pipe(v.string(), v.isoDate())]), ""),
      "",
    ),
  }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(yearQuery(params.yearId)),
      context.queryClient.ensureQueryData(yearsQuery),
    ]);
  },
  component: YearPage,
});

function YearTrail() {
  const { yearId } = Route.useParams();
  const year = useSuspenseQuery(yearQuery(yearId)).data;
  return <BreadcrumbCurrent>{yearTitle(year)}</BreadcrumbCurrent>;
}

function YearPage() {
  const { yearId } = Route.useParams();
  const { tab, on } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <YearRecord
      yearId={yearId}
      tab={tab}
      on={on}
      onTab={(nextTab) => {
        void navigate({
          search: (previous) => ({ ...previous, tab: nextTab, on: "" }),
        });
      }}
    />
  );
}
