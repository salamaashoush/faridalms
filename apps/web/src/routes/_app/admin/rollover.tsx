import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { RolloverWorkspace } from "~/components/admin/RolloverWorkspace";
import * as m from "~/i18n/messages";
import { rolloverQuery } from "~/queries/rollover";

export const Route = createFileRoute("/_app/admin/rollover")({
  staticData: { breadcrumb: m.rolloverBreadcrumb },
  validateSearch: v.object({
    source: v.pipe(v.string(), v.uuid()),
    target: v.pipe(v.string(), v.uuid()),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(
      rolloverQuery({ sourceYearId: deps.source, targetYearId: deps.target }),
    );
  },
  component: RolloverPage,
});

function RolloverPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(
    rolloverQuery({ sourceYearId: search.source, targetYearId: search.target }),
  );
  return (
    <RolloverWorkspace
      key={`${data.status}:${data.revision}`}
      preview={data}
      onClose={() => {
        void navigate({ to: "/admin/academic-years" });
      }}
    />
  );
}
