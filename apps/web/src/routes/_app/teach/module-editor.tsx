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
  BreadcrumbCurrent,
  BreadcrumbStep,
} from "~/components/app/WorkspaceBreadcrumb";
import { ModuleEditor } from "~/components/learning/ModuleEditor";
import * as m from "~/i18n/messages";
import { learningOptionsQuery, moduleRecordQuery } from "~/queries/learning";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/teach/module-editor")({
  staticData: { trail: <EditorTrail />, section: "/teach/modules" },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    classId: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("learning:author"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await Promise.all([
      context.queryClient.ensureQueryData(learningOptionsQuery),
      deps.id
        ? context.queryClient.ensureQueryData(moduleRecordQuery(deps.id))
        : null,
    ]);
  },
  component: EditorPage,
});

function EditorTrail() {
  const { id } = Route.useSearch();
  return id ? (
    <EditTrail id={id} />
  ) : (
    <BreadcrumbCurrent>{m.lrnNewModule()}</BreadcrumbCurrent>
  );
}

function EditTrail({ id }: { id: string }) {
  const existing = useSuspenseQuery(moduleRecordQuery(id)).data;
  return (
    <>
      <BreadcrumbStep
        render={
          <Link to="/modules/$moduleId" params={{ moduleId: id }} search={{}} />
        }
      >
        {existing.title}
      </BreadcrumbStep>
      <BreadcrumbCurrent>{m.lrnEditModule()}</BreadcrumbCurrent>
    </>
  );
}

function ExistingEditor({
  id,
  onClose,
}: {
  id: string;
  onClose: (saved?: string) => void;
}) {
  const existing = useSuspenseQuery(moduleRecordQuery(id)).data;
  return (
    <ModuleEditor
      key={existing.id}
      existing={existing}
      classId=""
      onClose={onClose}
    />
  );
}

function EditorPage() {
  const { id, classId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const close = (saved?: string) => {
    if (saved) {
      void navigate({
        to: "/modules/$moduleId",
        params: { moduleId: saved },
        search: {},
        replace: true,
      });
      return;
    }
    if (canGoBack) {
      router.history.back();
      return;
    }
    void navigate({ to: "/teach/modules", search: {} });
  };
  return id ? (
    <ExistingEditor id={id} onClose={close} />
  ) : (
    <ModuleEditor existing={null} classId={classId ?? ""} onClose={close} />
  );
}
