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

import { classTitle } from "~/components/classes/format";
import {
  ExistingHomeroomEditor,
  HomeroomEditor,
} from "~/components/homerooms/HomeroomEditor";
import * as m from "~/i18n/messages";
import { classOptionsQuery, classRecordQuery } from "~/queries/classes";
import { homeroomOfClassQuery } from "~/queries/homerooms";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/_staff/homeroom-editor")({
  staticData: {
    trail: <EditorTrail />,
    section: "/classes",
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
      deps.id
        ? context.queryClient.ensureQueryData(homeroomOfClassQuery(deps.id))
        : null,
    ]);
  },
  component: HomeroomEditorPage,
});

function EditorTrail() {
  const { id } = Route.useSearch();
  return id ? (
    <EditTrail classId={id} />
  ) : (
    <BreadcrumbCurrent>{m.homeroomsAdd()}</BreadcrumbCurrent>
  );
}

interface EditTrailProps {
  classId: string;
}

function EditTrail({ classId }: EditTrailProps) {
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
      <BreadcrumbCurrent>{m.homeroomsEdit()}</BreadcrumbCurrent>
    </>
  );
}

function HomeroomEditorPage() {
  const { year, id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const close = () => {
    if (canGoBack) {
      router.history.back();
      return;
    }
    void navigate({ to: "/classes", search: {} });
  };
  return id ? (
    <ExistingHomeroomEditor key={id} id={id} onClose={close} />
  ) : (
    <HomeroomEditor yearId={year} onClose={close} />
  );
}
