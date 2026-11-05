import { createFileRoute, redirect } from "@tanstack/react-router";
import * as v from "valibot";

import {
  PERSON_TABS,
  PersonRecord,
  personTabsFor,
} from "~/components/people/PersonRecord";
import * as m from "~/i18n/messages";
import { accessRolesQuery, personAccessQuery } from "~/queries/access";
import { personHistoryQuery, personRecordQuery } from "~/queries/students";

export const Route = createFileRoute("/_app/people/$userId")({
  staticData: { breadcrumb: m.personRecordBreadcrumb },
  validateSearch: v.object({
    tab: v.fallback(
      v.optional(v.picklist(PERSON_TABS), "overview"),
      "overview",
    ),
  }),
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ context, params, deps }) => {
    const { queryClient } = context;
    const record = await queryClient.ensureQueryData(
      personRecordQuery(params.userId),
    );
    if (!personTabsFor(record.access)[deps.tab])
      throw redirect({
        to: "/people/$userId",
        params: { userId: params.userId },
        search: { tab: "overview" as const },
        replace: true,
      });
    if (deps.tab === "history")
      await queryClient.ensureInfiniteQueryData(
        personHistoryQuery(params.userId),
      );
    if (deps.tab === "access")
      await Promise.all([
        queryClient.ensureQueryData(personAccessQuery(params.userId)),
        queryClient.ensureQueryData(accessRolesQuery),
      ]);
  },
  component: PersonPage,
});

function PersonPage() {
  const { userId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PersonRecord
      userId={userId}
      tab={tab}
      onTab={(nextTab) => {
        void navigate({
          search: (previous) => ({ ...previous, tab: nextTab }),
        });
      }}
    />
  );
}
