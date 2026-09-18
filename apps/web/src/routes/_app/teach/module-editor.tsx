import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";

import type { getAuthoringContext } from "~/server/assignments";

import { ModuleWorkspace } from "~/components/learning/ModuleWorkspace";
import * as m from "~/i18n/messages";
import { authoringContextQuery } from "~/queries/assignments";
import { moduleAuthoringQuery } from "~/queries/learning";

export const Route = createFileRoute("/_app/teach/module-editor")({
  staticData: { breadcrumb: m.learningModuleDesign },
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(authoringContextQuery(""));
    if (deps.id)
      await context.queryClient.ensureQueryData(moduleAuthoringQuery(deps.id));
  },
  component: EditorPage,
});
function EditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const {
    data: { classes },
  } = useSuspenseQuery(authoringContextQuery(""));
  const close = () => {
    void navigate({ to: "/teach/modules" });
  };
  const saved = (moduleId: string) => {
    void navigate({
      to: "/teach/module-editor",
      search: { id: moduleId },
      replace: true,
    });
  };
  return id ? (
    <Existing
      key={id}
      id={id}
      classes={classes}
      onClose={close}
      onSaved={saved}
    />
  ) : (
    <NewModule classes={classes} onClose={close} onSaved={saved} />
  );
}
type Classes = Awaited<ReturnType<typeof getAuthoringContext>>["classes"];
function Existing({
  id,
  classes,
  onClose,
  onSaved,
}: {
  id: string;
  classes: Classes;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { data } = useSuspenseQuery(moduleAuthoringQuery(id));
  return (
    <ModuleWorkspace
      initial={{
        id: data.id,
        expectedRevision: data.revision,
        classId: data.classId,
        subjectId: data.subjectId,
        title: data.title,
        summary: data.summary,
      }}
      status={data.status}
      classes={classes}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
function NewModule({
  classes,
  onClose,
  onSaved,
}: {
  classes: Classes;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const first = classes[0];
  if (!first) return <p role="alert">{m.learningNoClasses()}</p>;
  return (
    <ModuleWorkspace
      initial={{
        id,
        expectedRevision: 0,
        classId: first.id,
        subjectId: first.authoringSubjects[0]?.id ?? "",
        title: "",
        summary: "",
      }}
      status="draft"
      classes={classes}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
