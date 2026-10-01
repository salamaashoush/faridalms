import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useCanGoBack,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";

import {
  BreadcrumbCurrent,
  BreadcrumbStep,
} from "~/components/app/WorkspaceBreadcrumb";
import { LessonEditor } from "~/components/learning/LessonEditor";
import * as m from "~/i18n/messages";
import { lessonEditorQuery, moduleRecordQuery } from "~/queries/learning";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/teach/lesson-editor")({
  staticData: { trail: <EditorTrail />, section: "/teach/modules" },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    moduleId: v.pipe(v.string(), v.uuid()),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("learning:author"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await Promise.all([
      context.queryClient.ensureQueryData(moduleRecordQuery(deps.moduleId)),
      deps.id
        ? context.queryClient.ensureQueryData(lessonEditorQuery(deps.id))
        : null,
    ]);
  },
  component: EditorPage,
});

function EditorTrail() {
  const { id, moduleId } = Route.useSearch();
  const module = useSuspenseQuery(moduleRecordQuery(moduleId)).data;
  return (
    <>
      <BreadcrumbStep
        render={
          <Link to="/modules/$moduleId" params={{ moduleId }} search={{}} />
        }
      >
        {module.title}
      </BreadcrumbStep>
      <BreadcrumbCurrent>
        {id ? m.lrnEditLesson() : m.lrnNewLesson()}
      </BreadcrumbCurrent>
    </>
  );
}

function ExistingEditor({
  id,
  moduleId,
  onClose,
  onCreated,
}: {
  id: string;
  moduleId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const existing = useSuspenseQuery(lessonEditorQuery(id)).data;
  return (
    <LessonEditor
      key={existing.id}
      existing={existing}
      moduleId={moduleId}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function EditorPage() {
  const { id, moduleId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const [created, setCreated] = useState<string | null>(null);
  const close = () => {
    if (canGoBack) {
      router.history.back();
      return;
    }
    void navigate({
      to: "/modules/$moduleId",
      params: { moduleId },
      search: {},
    });
  };
  // The first autosave gives a new lesson its address, so a reload reopens
  // it; the editor already open stays mounted with what is being typed.
  const onCreated = (saved: string) => {
    setCreated(saved);
    void navigate({ search: { id: saved, moduleId }, replace: true });
  };
  return id && id !== created ? (
    <ExistingEditor
      id={id}
      moduleId={moduleId}
      onClose={close}
      onCreated={onCreated}
    />
  ) : (
    <LessonEditor
      existing={null}
      moduleId={moduleId}
      onClose={close}
      onCreated={onCreated}
    />
  );
}
