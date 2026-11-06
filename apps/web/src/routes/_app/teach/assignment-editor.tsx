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
import { useState } from "react";
import * as v from "valibot";

import { AssignmentEditor } from "~/components/coursework/AssignmentEditor";
import * as m from "~/i18n/messages";
import {
  assignmentEditorQuery,
  courseworkOptionsQuery,
} from "~/queries/coursework";
import { collaborationQuery } from "~/queries/documents";
import { templateQuery } from "~/queries/library";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/teach/assignment-editor")({
  staticData: { trail: <EditorTrail />, section: "/teach/assignments" },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    classId: v.optional(v.pipe(v.string(), v.uuid())),
    /** A library piece a new assignment starts from. */
    template: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => ({ id: search.id, template: search.template }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "assignments:author");
    await Promise.all([
      context.queryClient.ensureQueryData(courseworkOptionsQuery),
      deps.id
        ? context.queryClient.ensureQueryData(assignmentEditorQuery(deps.id))
        : null,
      deps.id
        ? context.queryClient.prefetchQuery(
            collaborationQuery({ hostType: "assignment", hostId: deps.id }),
          )
        : null,
      deps.template && !deps.id
        ? context.queryClient.ensureQueryData(templateQuery(deps.template))
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

interface EditTrailProps {
  id: string;
}

function EditTrail({ id }: EditTrailProps) {
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

interface ExistingEditorProps {
  id: string;
  onClose: (saved?: string) => void;
  onCreated: (id: string) => void;
}

function ExistingEditor({ id, onClose, onCreated }: ExistingEditorProps) {
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

interface NewEditorProps {
  classId?: string;
  template: string;
  onClose: (saved?: string) => void;
  onCreated: (id: string) => void;
}

function NewEditor({ classId, template, onClose, onCreated }: NewEditorProps) {
  const piece = useSuspenseQuery(templateQuery(template)).data;
  return (
    <AssignmentEditor
      existing={null}
      classId={classId}
      template={piece}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function EditorPage() {
  const { id, classId, template } = Route.useSearch();
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
    void navigate({
      search: (previous) => ({ ...previous, id: saved }),
      replace: true,
    });
  };
  return id && id !== created ? (
    <ExistingEditor id={id} onClose={close} onCreated={onCreated} />
  ) : template ? (
    <NewEditor
      classId={classId}
      template={template}
      onClose={close}
      onCreated={onCreated}
    />
  ) : (
    <AssignmentEditor
      existing={null}
      classId={classId}
      onClose={close}
      onCreated={onCreated}
    />
  );
}
