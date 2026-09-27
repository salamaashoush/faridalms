import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { BreadcrumbCurrent } from "~/components/app/WorkspaceBreadcrumb";
import { Register } from "~/components/attendance/Register";
import { classTitle } from "~/components/classes/format";
import { registerQuery } from "~/queries/attendance";

const uuid = v.pipe(v.string(), v.uuid());

export const Route = createFileRoute("/_app/registers/$classId")({
  staticData: {
    trail: <RegisterTrail />,
    section: ["/teach/attendance", "/admin/attendance"],
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

function RegisterPage() {
  const { classId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Register
      classId={classId}
      date={search.date}
      periodId={search.periodId ?? ""}
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
