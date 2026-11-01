import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import * as v from "valibot";

import { FormEditor } from "~/components/admissions/FormEditor";
import { BreadcrumbCurrent } from "~/components/app/WorkspaceBreadcrumb";
import * as m from "~/i18n/messages";
import { formQuery } from "~/queries/admissions";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/admissions/form-editor")({
  staticData: {
    trail: <BreadcrumbCurrent>{m.afmEditorCrumb()}</BreadcrumbCurrent>,
    section: "/admissions/intakes",
  },
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("admissions:configure"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    if (deps.id) await context.queryClient.ensureQueryData(formQuery(deps.id));
  },
  component: FormEditorPage,
});

function FormEditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const form = useQuery({ ...formQuery(id ?? ""), enabled: Boolean(id) }).data;
  if (id && !form) return null;
  return (
    <FormEditor
      key={`${form?.id ?? "new"}:${String(form?.version ?? 0)}`}
      initial={{
        id: form?.id ?? "",
        version: form?.version ?? 0,
        nameEn: form?.nameEn ?? "",
        nameAr: form?.nameAr ?? "",
        questions: form?.questions ?? [],
        published: Boolean(form?.published),
      }}
      onDone={() =>
        void navigate({ to: "/admissions/intakes", search: { tab: "forms" } })
      }
    />
  );
}
