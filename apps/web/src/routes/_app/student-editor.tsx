import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  useCanGoBack,
  useRouter,
} from "@tanstack/react-router";
import * as v from "valibot";

import {
  BreadcrumbCurrent,
  BreadcrumbStep,
} from "~/components/app/WorkspaceBreadcrumb";
import { displayName } from "~/components/people/format";
import {
  ExistingStudentEditor,
  StudentEditor,
} from "~/components/people/StudentEditor";
import * as m from "~/i18n/messages";
import { peopleOptionsQuery, studentRecordQuery } from "~/queries/students";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/student-editor")({
  staticData: {
    trail: <EditorTrail />,
    section: "/admin/students",
  },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    // Set by the list or the record, so leaving returns there.
    from: v.optional(v.picklist(["list", "record"])),
  }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "people:manage");
    await Promise.all([
      context.queryClient.ensureQueryData(peopleOptionsQuery),
      deps.id
        ? context.queryClient.ensureQueryData(studentRecordQuery(deps.id))
        : null,
    ]);
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
  const record = useSuspenseQuery(studentRecordQuery(studentId)).data;
  return (
    <>
      <BreadcrumbStep
        render={
          <Link to="/students/$studentId" params={{ studentId }} search={{}} />
        }
      >
        {displayName(record)}
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
    if (from && canGoBack) {
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
