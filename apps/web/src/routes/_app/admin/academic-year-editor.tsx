import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { AcademicYearEditor } from "~/components/admin/AcademicYearEditor";
import * as m from "~/i18n/messages";
import { academicYearQuery } from "~/queries/academic-years";

export const Route = createFileRoute("/_app/admin/academic-year-editor")({
  staticData: { breadcrumb: m.studentSchoolYear },
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (deps.id)
      await context.queryClient.ensureQueryData(academicYearQuery(deps.id));
  },
  component: AcademicYearEditorPage,
});
function AcademicYearEditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const close = () => {
    void navigate({ to: "/admin/academic-years" });
  };
  return id ? (
    <EditYear id={id} onClose={close} />
  ) : (
    <AcademicYearEditor onClose={close} />
  );
}
function EditYear({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useSuspenseQuery(academicYearQuery(id));
  return (
    <AcademicYearEditor
      key={data.id}
      initial={{
        id: data.id,
        expectedRevision: data.revision,
        name: data.name,
        startsOn: data.startsOn,
        endsOn: data.endsOn,
        terms: data.terms.map((term) => ({
          id: term.id,
          name: term.name,
          startsOn: term.startsOn,
          endsOn: term.endsOn,
        })),
      }}
      onClose={onClose}
    />
  );
}
