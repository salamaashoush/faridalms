import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { AssignmentDesigner } from "~/components/assignments/AssignmentDesigner";
import * as m from "~/i18n/messages";
import {
  authoringAssignmentQuery,
  authoringContextQuery,
} from "~/queries/assignments";

export const Route = createFileRoute("/_app/teach/assignment-editor")({
  staticData: { breadcrumb: m.assignmentDesignTitle },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    classId: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (deps.id) {
      const assignment = await context.queryClient.ensureQueryData(
        authoringAssignmentQuery(deps.id),
      );
      await context.queryClient.ensureQueryData(
        authoringContextQuery(assignment.classId),
      );
      return;
    }
    await context.queryClient.ensureQueryData(
      authoringContextQuery(deps.classId ?? ""),
    );
  },
  component: EditorPage,
});
function EditorPage() {
  const { id, classId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const close = () => {
    void navigate({ to: "/teach/assignments" });
  };
  const saved = (assignmentId: string) => {
    void navigate({
      to: "/teach/assignment-editor",
      search: { id: assignmentId },
      replace: true,
    });
  };
  const published = (assignmentId: string) => {
    void navigate({
      to: "/assignments/$assignmentId",
      params: { assignmentId },
      search: {},
    });
  };
  return id ? (
    <Existing
      key={id}
      id={id}
      onClose={close}
      onSaved={saved}
      onPublished={published}
    />
  ) : (
    <Fresh
      key={classId ?? ""}
      classId={classId ?? ""}
      onClassChange={(next) => {
        void navigate({
          to: "/teach/assignment-editor",
          search: { classId: next },
          replace: true,
        });
      }}
      onClose={close}
      onSaved={saved}
      onPublished={published}
    />
  );
}
function Existing({
  id,
  onClose,
  onSaved,
  onPublished,
}: {
  id: string;
  onClose: () => void;
  onSaved: (id: string) => void;
  onPublished: (id: string) => void;
}) {
  const { data } = useSuspenseQuery(authoringAssignmentQuery(id));
  const { data: context } = useSuspenseQuery(
    authoringContextQuery(data.classId),
  );
  return (
    <AssignmentDesigner
      initial={data}
      context={context}
      classId={data.classId}
      onClassChange={() => undefined}
      onClose={onClose}
      onSaved={onSaved}
      onPublished={onPublished}
    />
  );
}
function Fresh({
  classId,
  onClassChange,
  onClose,
  onSaved,
  onPublished,
}: {
  classId: string;
  onClassChange: (classId: string) => void;
  onClose: () => void;
  onSaved: (id: string) => void;
  onPublished: (id: string) => void;
}) {
  const { data: context } = useSuspenseQuery(authoringContextQuery(classId));
  if (!context.classId)
    return <p role="alert">{m.assignmentNoAuthoringClasses()}</p>;
  return (
    <AssignmentDesigner
      initial={null}
      context={context}
      classId={context.classId}
      onClassChange={onClassChange}
      onClose={onClose}
      onSaved={onSaved}
      onPublished={onPublished}
    />
  );
}
