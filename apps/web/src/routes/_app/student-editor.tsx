import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useCanGoBack,
  useRouter,
} from "@tanstack/react-router";
import * as v from "valibot";

import {
  ExistingStudentEditor,
  prepareStudentEditor,
  StudentEditor,
} from "~/components/admin/StudentEditor";
import {
  BreadcrumbCurrent,
  BreadcrumbStep,
} from "~/components/app/WorkspaceBreadcrumb";
import * as m from "~/i18n/messages";
import { studentQuery } from "~/queries/school";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/student-editor")({
  staticData: {
    trail: <EditorTrail />,
    section: "/admin/students",
  },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    // Set by the students list, so leaving returns to it with its filters.
    from: v.optional(v.picklist(["list"])),
  }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("people:manage"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await prepareStudentEditor(context.queryClient, deps.id);
  },
  component: StudentEditorPage,
});

function EditorTrail() {
  const { id } = Route.useSearch();
  return id ? (
    <EditTrail studentId={id} />
  ) : (
    <BreadcrumbCurrent>{m.managementAddStudent()}</BreadcrumbCurrent>
  );
}

function EditTrail({ studentId }: { studentId: string }) {
  const { profile } = useSuspenseQuery(studentQuery({ studentId })).data;
  return (
    <>
      <BreadcrumbStep
        render={
          <Link to="/students/$studentId" params={{ studentId }} search={{}} />
        }
      >
        {profile.fullName}
      </BreadcrumbStep>
      <BreadcrumbCurrent>{m.managementEditStudent()}</BreadcrumbCurrent>
    </>
  );
}

function StudentEditorPage() {
  const { id, from } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const close = () => {
    if (from === "list" && canGoBack) {
      router.history.back();
      return;
    }
    void (id
      ? navigate({
          to: "/students/$studentId",
          params: { studentId: id },
          search: {},
        })
      : navigate({ to: "/admin/students", search: {} }));
  };
  return id ? (
    <ExistingStudentEditor key={id} id={id} onClose={close} />
  ) : (
    <StudentEditor onClose={close} />
  );
}
