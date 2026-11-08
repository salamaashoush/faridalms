import { BreadcrumbCurrent } from "@faridalms/ui/system/app-shell";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import * as v from "valibot";

import { areaViewSearch } from "~/components/files/AreaFiles";
import { MODULE_TABS, ModuleRecord } from "~/components/learning/ModuleRecord";
import { ModuleOutline } from "~/components/learning/StudentModules";
import { moduleOutlineQuery, moduleRecordQuery } from "~/queries/learning";

const searchSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(MODULE_TABS), "lessons"), "lessons"),
  ...areaViewSearch,
  classId: v.fallback(
    v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
    "",
  ),
  studentId: v.fallback(
    v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
    "",
  ),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

const learns = (workspace: string | null) =>
  workspace === "me" || workspace === "family";

/**
 * One address for a module: those who teach it manage its lessons and read
 * everyone's progress, a student works through it, a family follows along.
 */
export const Route = createFileRoute("/_app/modules/$moduleId")({
  staticData: {
    trail: <ModuleTrail />,
    section: ["/modules", "/me/modules", "/family/modules"],
  },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => ({ studentId: search.studentId }),
  loader: async ({ context, params, deps }) => {
    if (learns(context.auth.workspace))
      await context.queryClient.ensureQueryData(
        moduleOutlineQuery(params.moduleId, deps.studentId),
      );
    else
      await context.queryClient.ensureQueryData(
        moduleRecordQuery(params.moduleId),
      );
  },
  component: ModulePage,
});

interface RecordTrailProps {
  id: string;
}

function RecordTrail({ id }: RecordTrailProps) {
  const data = useSuspenseQuery(moduleRecordQuery(id)).data;
  return <BreadcrumbCurrent>{data.title}</BreadcrumbCurrent>;
}

interface OutlineTrailProps {
  id: string;
  studentId: string;
}

function OutlineTrail({ id, studentId }: OutlineTrailProps) {
  const data = useSuspenseQuery(moduleOutlineQuery(id, studentId)).data;
  return <BreadcrumbCurrent>{data.title}</BreadcrumbCurrent>;
}

function ModuleTrail() {
  const { moduleId } = Route.useParams();
  const { studentId } = Route.useSearch();
  const { auth } = Route.useRouteContext();
  return learns(auth.workspace) ? (
    <OutlineTrail id={moduleId} studentId={studentId} />
  ) : (
    <RecordTrail id={moduleId} />
  );
}

function ModulePage() {
  const { moduleId } = Route.useParams();
  const { tab, classId, studentId, ...files } = Route.useSearch();
  const { auth } = Route.useRouteContext();
  const navigate = Route.useNavigate();
  if (learns(auth.workspace))
    return <ModuleOutline moduleId={moduleId} studentId={studentId} />;
  return (
    <ModuleRecord
      moduleId={moduleId}
      tab={tab}
      classId={classId}
      onTab={(next) => {
        void navigate({
          resetScroll: false,
          replace: true,
          search: (previous) => ({ ...previous, tab: next }),
        });
      }}
      onClass={(next) => {
        void navigate({
          search: (previous) => ({ ...previous, classId: next }),
        });
      }}
      files={files}
      onFiles={(next) => {
        void navigate({
          search: (previous) => ({ ...previous, ...next }),
          replace: true,
        });
      }}
    />
  );
}
