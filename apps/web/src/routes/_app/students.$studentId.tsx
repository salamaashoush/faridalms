import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { StudentProfile } from "~/components/records/StudentProfile";
import { studentQuery } from "~/queries/school";

export const Route = createFileRoute("/_app/students/$studentId")({
  validateSearch: v.object({
    tab: v.optional(
      v.picklist(["information", "contact", "medical"]),
      "information",
    ),
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      studentQuery({ studentId: params.studentId }),
    ),
  component: StudentPage,
});
function StudentPage() {
  const { studentId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <StudentProfile
      studentId={studentId}
      tab={tab}
      onTab={(nextTab) => {
        void navigate({ search: { tab: nextTab } });
      }}
    />
  );
}
