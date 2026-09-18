import { ROLE_HOME } from "@faridalms/domain/identity";
import { createFileRoute, redirect } from "@tanstack/react-router";
import * as v from "valibot";

import {
  ExistingStudentEditor,
  StudentEditor,
} from "~/components/admin/StudentEditor";
import { currentUserQuery } from "~/queries/user";
import { getStudentForManagement } from "~/server/school";

export const Route = createFileRoute("/_app/student-editor")({
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.permissions.includes("users:manage"))
      throw redirect({ to: ROLE_HOME[user.role] });
    if (deps.id)
      await context.queryClient.ensureQueryData({
        queryKey: ["student-management", deps.id],
        queryFn: () => getStudentForManagement({ data: { id: deps.id ?? "" } }),
      });
  },
  component: StudentEditorPage,
});
function StudentEditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const close = () => {
    void (id
      ? navigate({
          to: "/students/$studentId",
          params: { studentId: id },
          search: {},
        })
      : navigate({ to: "/admin/students", search: {} }));
  };
  return id ? (
    <ExistingStudentEditor id={id} onClose={close} />
  ) : (
    <StudentEditor onClose={close} />
  );
}
