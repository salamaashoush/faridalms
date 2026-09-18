import { emptyLesson } from "@faridalms/domain/learning";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";

import { LessonWorkspace } from "~/components/learning/LessonWorkspace";
import * as m from "~/i18n/messages";
import { lessonAuthoringQuery, moduleAuthoringQuery } from "~/queries/learning";

export const Route = createFileRoute("/_app/teach/lesson-editor")({
  staticData: { breadcrumb: m.learningLessonDesign },
  validateSearch: v.object({
    module: v.pipe(v.string(), v.uuid()),
    id: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(
      moduleAuthoringQuery(deps.module),
    );
    if (deps.id)
      await context.queryClient.ensureQueryData(lessonAuthoringQuery(deps.id));
  },
  component: EditorPage,
});
function EditorPage() {
  const { id, module } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(moduleAuthoringQuery(module));
  const close = () => {
    void navigate({ to: "/teach/module-editor", search: { id: module } });
  };
  const saved = (lessonId: string) => {
    void navigate({
      to: "/teach/lesson-editor",
      search: { id: lessonId, module },
      replace: true,
    });
  };
  return id ? (
    <Existing
      key={id}
      id={id}
      moduleTitle={data.title}
      onClose={close}
      onSaved={saved}
    />
  ) : (
    <NewLesson
      moduleId={module}
      moduleTitle={data.title}
      position={data.lessons.length}
      onClose={close}
      onSaved={saved}
    />
  );
}
function Existing({
  id,
  moduleTitle,
  onClose,
  onSaved,
}: {
  id: string;
  moduleTitle: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { data } = useSuspenseQuery(lessonAuthoringQuery(id));
  return (
    <LessonWorkspace
      initial={{
        id: data.id,
        moduleId: data.moduleId,
        expectedRevision: data.revision,
        title: data.title,
        position: data.position,
        document: data.document,
      }}
      moduleTitle={moduleTitle}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
function NewLesson({
  moduleId,
  moduleTitle,
  position,
  onClose,
  onSaved,
}: {
  moduleId: string;
  moduleTitle: string;
  position: number;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  return (
    <LessonWorkspace
      initial={{
        id,
        moduleId,
        expectedRevision: 0,
        title: "",
        position,
        document: emptyLesson(),
      }}
      moduleTitle={moduleTitle}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
