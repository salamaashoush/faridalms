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
import { classEditorParts } from "~/components/classes/slots";
import {
  ExistingHomeroomEditor,
  HomeroomEditor,
} from "~/components/homerooms/HomeroomEditor";
import * as m from "~/i18n/messages";
import { classOptionsQuery, classRecordQuery } from "~/queries/classes";
import { homeroomOfClassQuery } from "~/queries/homerooms";
import { currentUserQuery } from "~/queries/user";
import { filled } from "~/utils/extension";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/_staff/homeroom-editor")({
  staticData: {
    trail: <EditorTrail />,
    section: "/classes",
  },
  // Loose, so the view of a module the form was opened from rides along.
  validateSearch: v.looseObject({
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
      ...filled(context.extensions, user.modules, classEditorParts).map(
        (part) =>
          context.queryClient.ensureQueryData(part.query(deps.id ?? null)),
      ),
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
  const search = Route.useSearch();
  const { id } = search;
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
    <ExistingHomeroomEditor key={id} id={id} search={search} onClose={close} />
  ) : (
    <HomeroomEditor search={search} onClose={close} />
  );
}
