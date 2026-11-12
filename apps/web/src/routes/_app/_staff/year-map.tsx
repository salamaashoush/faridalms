import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { ButtonLink } from "@faridalms/ui/system/button-link";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { CalendarRange, Plus } from "lucide-react";
import * as v from "valibot";

import { classChoices } from "~/components/classes/format";
import { YearMap } from "~/components/learning/YearMap";
import { NoSchoolYear } from "~/components/years/NoSchoolYear";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { unitPlanQuery } from "~/queries/learning";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

const searchSchema = v.object({
  classId: v.fallback(
    v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
    "",
  ),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/_staff/year-map")({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => ({ classId: search.classId }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "learning:author");
    await context.queryClient.ensureQueryData(unitPlanQuery(deps.classId));
  },
  staticData: { breadcrumb: m.yearMapTitle, section: "/modules" },
  component: YearMapPage,
});

function YearMapPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const map = useSuspenseQuery(unitPlanQuery(search.classId)).data;
  if (!map.ready)
    return (
      <>
        <PageHeader title={m.yearMapTitle()} />
        <NoSchoolYear shows={m.noYearShowsYearMap()} />
      </>
    );
  if (!map.classId)
    return (
      <Page width="list">
        <PageHeader title={m.yearMapTitle()} />
        <EmptyState
          icon={CalendarRange}
          title={m.lrnNoClasses()}
          description={m.lrnNoClassesBody()}
        />
      </Page>
    );
  const classFacet: Facet = {
    id: "class",
    label: m.lrnClass(),
    single: true,
    options: classChoices(map.classes),
    selected: [map.classId],
    defaultSelected: map.opening ? [map.opening] : [],
    onChange: ([next = ""]) => {
      void navigate({ search: { classId: next } });
    },
  };
  return (
    <Page width="list">
      <PageHeader title={m.yearMapTitle()} description={m.yearMapHint()} />
      <div className="grid gap-4">
        {map.classes.length > 1 ? <IndexToolbar facets={[classFacet]} /> : null}
        {!map.frame ? (
          <EmptyState
            icon={CalendarRange}
            title={m.yearMapNoYearTitle()}
            description={m.yearMapNoYearBody()}
          />
        ) : map.units.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title={m.yearMapNoUnits()}
            description={m.yearMapNoUnitsBody()}
            action={
              <ButtonLink to="/module-editor" search={{ classId: map.classId }}>
                <Plus aria-hidden />
                {m.lrnNewModule()}
              </ButtonLink>
            }
          />
        ) : (
          <YearMap map={{ ...map, frame: map.frame }} today={user.today} />
        )}
      </div>
    </Page>
  );
}
