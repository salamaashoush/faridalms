import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import * as v from "valibot";

import {
  BreadcrumbCurrent,
  BreadcrumbStep,
} from "~/components/app/WorkspaceBreadcrumb";
import { yearTitle } from "~/components/years/format";
import { Rollover } from "~/components/years/Rollover";
import * as m from "~/i18n/messages";
import { classOptionsQuery } from "~/queries/classes";
import { rolloverQuery } from "~/queries/rollover";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/admin/rollover")({
  staticData: {
    trail: <RolloverTrail />,
    section: "/admin/academic-years",
  },
  validateSearch: v.object({
    source: v.pipe(v.string(), v.uuid()),
    target: v.pipe(v.string(), v.uuid()),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "years:manage");
    await Promise.all([
      context.queryClient.ensureQueryData(
        rolloverQuery({ sourceYearId: deps.source, targetYearId: deps.target }),
      ),
      context.queryClient.ensureQueryData(classOptionsQuery),
    ]);
  },
  component: RolloverPage,
});

function RolloverTrail() {
  const search = Route.useSearch();
  const data = useSuspenseQuery(
    rolloverQuery({ sourceYearId: search.source, targetYearId: search.target }),
  ).data;
  return (
    <>
      <BreadcrumbStep
        render={
          <Link
            to="/years/$yearId"
            params={{ yearId: data.target.id }}
            search={{}}
          />
        }
      >
        {yearTitle(data.target)}
      </BreadcrumbStep>
      <BreadcrumbCurrent>{m.rolloverBreadcrumb()}</BreadcrumbCurrent>
    </>
  );
}

function RolloverPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Rollover
      query={{ sourceYearId: search.source, targetYearId: search.target }}
      onClose={() => {
        void navigate({
          to: "/years/$yearId",
          params: { yearId: search.target },
          search: {},
        });
      }}
    />
  );
}
