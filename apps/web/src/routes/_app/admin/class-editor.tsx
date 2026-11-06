import {
  BreadcrumbCurrent,
  BreadcrumbStep,
} from "@faridalms/ui/system/app-shell";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  useCanGoBack,
  useRouter,
} from "@tanstack/react-router";
import * as v from "valibot";

import {
  ClassEditor,
  ExistingClassEditor,
} from "~/components/classes/ClassEditor";
import { classTitle } from "~/components/classes/format";
import * as m from "~/i18n/messages";
import { classOptionsQuery, classRecordQuery } from "~/queries/classes";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/admin/class-editor")({
  staticData: {
    trail: <EditorTrail />,
    section: "/admin/classes",
  },
  validateSearch: v.object({
    year: v.pipe(v.string(), v.uuid()),
    id: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "classes:manage");
    await Promise.all([
      context.queryClient.ensureQueryData(classOptionsQuery),
      deps.id
        ? context.queryClient.ensureQueryData(classRecordQuery(deps.id))
        : null,
    ]);
  },
  component: ClassEditorPage,
});

function EditorTrail() {
  const { id } = Route.useSearch();
  return id ? (
    <EditTrail classId={id} />
  ) : (
    <BreadcrumbCurrent>{m.classesAdd()}</BreadcrumbCurrent>
  );
}

function EditTrail({ classId }: { classId: string }) {
  const record = useSuspenseQuery(classRecordQuery(classId)).data;
  return (
    <>
      <BreadcrumbStep
        render={
          <Link to="/classes/$classId" params={{ classId }} search={{}} />
        }
      >
        {classTitle(record)}
      </BreadcrumbStep>
      <BreadcrumbCurrent>{m.classesEdit()}</BreadcrumbCurrent>
    </>
  );
}

function ClassEditorPage() {
  const { year, id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const close = () => {
    if (canGoBack) {
      router.history.back();
      return;
    }
    void navigate({ to: "/admin/classes", search: {} });
  };
  return id ? (
    <ExistingClassEditor key={id} id={id} onClose={close} />
  ) : (
    <ClassEditor yearId={year} onClose={close} />
  );
}
