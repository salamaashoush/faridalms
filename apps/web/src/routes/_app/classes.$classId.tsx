import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { CLASS_TABS, ClassRecord } from "~/components/classes/ClassRecord";
import * as m from "~/i18n/messages";
import { classOptionsQuery, classRecordQuery } from "~/queries/classes";

export const Route = createFileRoute("/_app/classes/$classId")({
  staticData: {
    breadcrumb: m.classesBreadcrumb,
    section: ["/admin/classes", "/teach/classes"],
  },
  validateSearch: v.object({
    // Old links named tabs that moved to other systems; they open the overview.
    tab: v.fallback(v.optional(v.picklist(CLASS_TABS), "overview"), "overview"),
  }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(classRecordQuery(params.classId)),
      context.queryClient.ensureQueryData(classOptionsQuery),
    ]);
  },
  component: ClassPage,
});

function ClassPage() {
  const { classId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ClassRecord
      classId={classId}
      tab={tab}
      onTab={(nextTab) => {
        void navigate({
          search: (previous) => ({ ...previous, tab: nextTab }),
        });
      }}
    />
  );
}
