import { BreadcrumbCurrent } from "@faridalms/ui/system/app-shell";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useRouterState } from "@tanstack/react-router";
import * as v from "valibot";

import { Register } from "~/components/attendance/Register";
import { classTitle } from "~/components/classes/format";
import { registerQuery } from "~/queries/attendance";

const uuid = v.pipe(v.string(), v.uuid());

export const Route = createFileRoute("/_app/registers/$classId")({
  staticData: {
    trail: <RegisterTrail />,
    section: ["/attendance", "/attendance"],
  },
  validateSearch: v.object({
    date: v.pipe(v.string(), v.isoDate()),
    periodId: v.optional(uuid),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, params, deps }) => {
    await context.queryClient.ensureQueryData(
      registerQuery(params.classId, deps.date, deps.periodId ?? ""),
    );
  },
  component: RegisterPage,
});

function RegisterTrail() {
  const { classId } = Route.useParams();
  const search = Route.useSearch();
  const data = useSuspenseQuery(
    registerQuery(classId, search.date, search.periodId ?? ""),
  ).data;
  return <BreadcrumbCurrent>{classTitle(data.class)}</BreadcrumbCurrent>;
}

const textOf = (value: unknown) => (typeof value === "string" ? value : "");

function RegisterPage() {
  const { classId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  // The address changes as soon as another day or period is chosen, while
  // the register shown stays the last one loaded until the next arrives.
  const askedDate = useRouterState({
    select: (state) => textOf(state.location.search.date),
  });
  const askedPeriod = useRouterState({
    select: (state) => textOf(state.location.search.periodId),
  });
  const switching =
    askedDate !== search.date || askedPeriod !== (search.periodId ?? "");
  return (
    <Register
      classId={classId}
      date={search.date}
      periodId={search.periodId ?? ""}
      loading={
        switching ? { date: askedDate, periodId: askedPeriod } : undefined
      }
      onChange={(change) => {
        void navigate({
          search: (previous) => ({
            ...previous,
            ...change,
            ...(change.date ? { periodId: previous.periodId } : {}),
          }),
        });
      }}
    />
  );
}
