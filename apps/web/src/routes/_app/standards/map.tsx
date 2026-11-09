import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { ButtonLink } from "@faridalms/ui/system/button-link";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Grid3x3 } from "lucide-react";
import * as v from "valibot";

import {
  ByItem,
  ByUnit,
  MapSummary,
} from "~/components/standards/CurriculumMap";
import * as m from "~/i18n/messages";
import { curriculumMapQuery } from "~/queries/standards";

const VIEWS = ["items", "units"] as const;

const searchSchema = v.object({
  frameworkId: v.fallback(
    v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
    "",
  ),
  view: v.fallback(v.optional(v.picklist(VIEWS), "items"), "items"),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/standards/map")({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => ({ frameworkId: search.frameworkId }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(curriculumMapQuery(deps.frameworkId)),
  staticData: { breadcrumb: m.curriculumMapTitle, section: "/standards" },
  component: CurriculumMapPage,
});

function CurriculumMapPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const map = useSuspenseQuery(curriculumMapQuery(search.frameworkId)).data;
  const header = (
    <PageHeader
      title={m.curriculumMapTitle()}
      description={m.curriculumMapHint()}
    />
  );
  if (!map.frameworkId)
    return (
      <Page width="list">
        {header}
        <EmptyState
          icon={Grid3x3}
          title={m.curriculumMapNoFrameworks()}
          description={m.curriculumMapNoFrameworksBody()}
          action={
            <ButtonLink to="/standards" search={{}}>
              {m.standardsTitle()}
            </ButtonLink>
          }
        />
      </Page>
    );
  const frameworkFacet: Facet = {
    id: "framework",
    label: m.standardsFramework(),
    single: true,
    options: map.frameworks.map((row) => ({ value: row.id, label: row.title })),
    selected: [map.frameworkId],
    onChange: ([next = ""]) => {
      void navigate({
        search: (previous) => ({ ...previous, frameworkId: next }),
      });
    },
  };
  return (
    <Page width="list">
      {header}
      <div className="grid gap-4">
        <IndexToolbar facets={[frameworkFacet]} />
        {map.units.length === 0 ? (
          <EmptyState
            icon={Grid3x3}
            title={m.curriculumMapNoUnits()}
            description={m.curriculumMapNoUnitsBody()}
          />
        ) : (
          <>
            <MapSummary map={map} />
            <RecordTabs
              label={m.curriculumMapViews()}
              tabs={[
                { value: "items", label: m.curriculumMapByItem() },
                { value: "units", label: m.curriculumMapByUnit() },
              ]}
              value={search.view}
              onChange={(view) => {
                void navigate({
                  resetScroll: false,
                  search: (previous) => ({ ...previous, view }),
                });
              }}
            >
              {search.view === "items" ? (
                <ByItem map={map} />
              ) : (
                <ByUnit map={map} />
              )}
            </RecordTabs>
          </>
        )}
      </div>
    </Page>
  );
}
