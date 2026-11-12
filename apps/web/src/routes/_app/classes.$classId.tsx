import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import * as v from "valibot";

import { ClassRecord } from "~/components/classes/ClassRecord";
import { classRecordParts } from "~/components/classes/slots";
import { areaViewSearch } from "~/components/files/AreaFiles";
import * as m from "~/i18n/messages";
import { classOptionsQuery, classRecordQuery } from "~/queries/classes";
import { currentUserQuery } from "~/queries/user";
import { filled } from "~/utils/extension";

const searchSchema = v.object({
  // Old links named tabs that moved to other systems; they open the overview.
  tab: v.fallback(
    v.optional(v.pipe(v.string(), v.regex(/^[a-z]{1,20}$/)), "overview"),
    "overview",
  ),
  ...areaViewSearch,
});

export const Route = createFileRoute("/_app/classes/$classId")({
  staticData: {
    breadcrumb: m.classesBreadcrumb,
    section: ["/classes", "/classes"],
  },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(v.parse(searchSchema, {}))] },
  loader: async ({ context, params }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    await Promise.all([
      context.queryClient.ensureQueryData(classRecordQuery(params.classId)),
      context.queryClient.ensureQueryData(classOptionsQuery),
      ...filled(context.extensions, user.modules, classRecordParts).map(
        (part) =>
          context.queryClient.ensureQueryData(part.query(params.classId)),
      ),
    ]);
  },
  component: ClassPage,
});

function ClassPage() {
  const { classId } = Route.useParams();
  const { tab, ...files } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ClassRecord
      classId={classId}
      tab={tab}
      onTab={(nextTab) => {
        void navigate({
          resetScroll: false,
          replace: true,
          search: (previous) => ({ ...previous, tab: nextTab }),
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
