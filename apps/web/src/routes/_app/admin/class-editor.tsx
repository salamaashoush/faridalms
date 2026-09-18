import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { ClassEditor } from "~/components/admin/ClassEditor";
import { classQuery } from "~/queries/school";

export const Route = createFileRoute("/_app/admin/class-editor")({
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (deps.id) await context.queryClient.ensureQueryData(classQuery(deps.id));
  },
  component: ClassEditorPage,
});
function ClassEditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const close = () => {
    void navigate({ to: "/admin/classes", search: {} });
  };
  return id ? (
    <EditClass id={id} onClose={close} />
  ) : (
    <ClassEditor onClose={close} />
  );
}

function EditClass({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useSuspenseQuery(classQuery(id));
  return (
    <ClassEditor
      initial={{
        id: data.id,
        name: data.name,
        grade: data.grade,
        stage: data.stage,
        room: data.room ?? "",
        homeroomTeacherId: data.homeroomTeacher?.id ?? "",
        subjects: data.subjects.flatMap((link) =>
          link.subject && link.teacher
            ? [{ subjectId: link.subject.id, teacherId: link.teacher.id }]
            : [],
        ),
      }}
      onClose={onClose}
    />
  );
}
