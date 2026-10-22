import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { CalendarRange, Plus } from "lucide-react";
import * as v from "valibot";

import type { Facet } from "~/components/system/IndexPage";

import { ButtonLink } from "~/components/app/ButtonLink";
import { classTitle } from "~/components/classes/format";
import { YearMap } from "~/components/learning/YearMap";
import {
  EmptyState,
  IndexToolbar,
  PageHeader,
} from "~/components/system/IndexPage";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { yearMapQuery } from "~/queries/learning";

const searchSchema = v.object({
  classId: v.fallback(
    v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
    "",
  ),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/teach/year-map")({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => ({ classId: search.classId }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(yearMapQuery(deps.classId)),
  staticData: { breadcrumb: m.yearMapTitle, section: "/teach/modules" },
  component: YearMapPage,
});

function YearMapPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const map = useSuspenseQuery(yearMapQuery(search.classId)).data;
  if (!map.classId)
    return (
      <>
        <PageHeader title={m.yearMapTitle()} />
        <EmptyState
          icon={CalendarRange}
          title={m.lrnNoClasses()}
          description={m.lrnNoClassesBody()}
        />
      </>
    );
  const classFacet: Facet = {
    id: "class",
    label: m.lrnClass(),
    single: true,
    options: map.classes.map((row) => ({
      value: row.id,
      label: classTitle(row),
    })),
    selected: [map.classId],
    defaultSelected: map.classes[0] ? [map.classes[0].id] : [],
    onChange: ([next = ""]) => {
      void navigate({ search: { classId: next } });
    },
  };
  return (
    <>
      <PageHeader title={m.yearMapTitle()} description={m.yearMapHint()} />
      <div className="grid gap-4">
        {map.classes.length > 1 ? <IndexToolbar facets={[classFacet]} /> : null}
        {map.units.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title={m.yearMapNoUnits()}
            description={m.yearMapNoUnitsBody()}
            action={
              <ButtonLink
                to="/teach/module-editor"
                search={{ classId: map.classId }}
              >
                <Plus aria-hidden />
                {m.lrnNewModule()}
              </ButtonLink>
            }
          />
        ) : (
          <YearMap map={map} today={user.today} />
        )}
      </div>
    </>
  );
}
