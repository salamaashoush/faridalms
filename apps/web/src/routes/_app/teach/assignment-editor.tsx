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
import { AssignmentEditor } from "~/components/coursework/AssignmentEditor";
import * as m from "~/i18n/messages";
import {
  assignmentEditorQuery,
  courseworkOptionsQuery,
} from "~/queries/coursework";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/teach/assignment-editor")({
  staticData: { trail: <EditorTrail />, section: "/teach/assignments" },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    classId: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("assignments:author"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await Promise.all([
      context.queryClient.ensureQueryData(courseworkOptionsQuery),
      deps.id
        ? context.queryClient.ensureQueryData(assignmentEditorQuery(deps.id))
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
    <BreadcrumbCurrent>{m.courseworkNewTitle()}</BreadcrumbCurrent>
  );
}

function EditTrail({ id }: { id: string }) {
  const existing = useSuspenseQuery(assignmentEditorQuery(id)).data;
  return (
    <>
      <BreadcrumbStep
        render={
          <Link
            to="/assignments/$assignmentId"
            params={{ assignmentId: id }}
            search={{}}
          />
        }
      >
        {existing.title}
      </BreadcrumbStep>
      <BreadcrumbCurrent>{m.courseworkEdit()}</BreadcrumbCurrent>
    </>
  );
}

function ExistingEditor({
  id,
  onClose,
  onCreated,
}: {
  id: string;
  onClose: (saved?: string) => void;
  onCreated: (id: string) => void;
}) {
  const existing = useSuspenseQuery(assignmentEditorQuery(id)).data;
  return (
    <AssignmentEditor
      key={existing.id}
      existing={existing}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function EditorPage() {
  const { id, classId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const [created, setCreated] = useState<string | null>(null);
  const close = (saved?: string) => {
    if (saved) {
      void navigate({
        to: "/assignments/$assignmentId",
        params: { assignmentId: saved },
        search: {},
        replace: true,
      });
      return;
    }
    if (canGoBack) {
      router.history.back();
      return;
    }
    void navigate({ to: "/teach/assignments", search: {} });
  };
  // The first autosave gives a new draft its address, so a reload reopens
  // it; the editor already open stays mounted with what is being typed.
  const onCreated = (saved: string) => {
    setCreated(saved);
    void navigate({ search: { id: saved }, replace: true });
  };
  return id && id !== created ? (
    <ExistingEditor id={id} onClose={close} onCreated={onCreated} />
  ) : (
    <AssignmentEditor
      existing={null}
      classId={classId}
      onClose={close}
      onCreated={onCreated}
    />
  );
}
