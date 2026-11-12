import { BreadcrumbCurrent } from "@faridalms/ui/system/app-shell";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { yearTitle } from "~/components/years/format";
import { YEAR_TABS, YearRecord } from "~/components/years/YearRecord";
import { yearQuery, yearsQuery } from "~/queries/years";

export const Route = createFileRoute("/_app/years/$yearId")({
  staticData: {
    trail: <YearTrail />,
    section: "/academic-years",
  },
  validateSearch: v.object({
    tab: v.fallback(v.optional(v.picklist(YEAR_TABS), "overview"), "overview"),
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
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <YearRecord
      yearId={yearId}
      tab={tab}
      onTab={(nextTab) => {
        void navigate({
          resetScroll: false,
          replace: true,
          search: (previous) => ({ ...previous, tab: nextTab }),
        });
      }}
    />
  );
}
