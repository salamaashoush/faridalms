import { BreadcrumbCurrent } from "@faridalms/ui/system/app-shell";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import {
  IntakeEditor,
  intakeDraft,
} from "~/components/admissions/IntakeEditor";
import * as m from "~/i18n/messages";
import { intakeOptionsQuery, intakeQuery } from "~/queries/admissions";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/admissions/intake-editor")({
  staticData: {
    trail: <BreadcrumbCurrent>{m.itkEditorCrumb()}</BreadcrumbCurrent>,
    section: "/admissions/intakes",
  },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    year: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "admissions:configure");
    await Promise.all([
      context.queryClient.ensureQueryData(intakeOptionsQuery),
      deps.id
        ? context.queryClient.ensureQueryData(intakeQuery(deps.id))
        : null,
    ]);
  },
  component: IntakeEditorPage,
});

function IntakeEditorPage() {
  const { id, year } = Route.useSearch();
  const navigate = Route.useNavigate();
  const options = useSuspenseQuery(intakeOptionsQuery).data;
  const intake = useQuery({
    ...intakeQuery(id ?? ""),
    enabled: Boolean(id),
  }).data;
  if (id && !intake) return null;
  return (
    <IntakeEditor
      key={`${intake?.id ?? "new"}:${String(intake?.version ?? 0)}`}
      options={options}
      initial={intakeDraft(options, intake, year)}
      onDone={() =>
        void navigate({
          to: "/admissions/intakes",
          search: { year: intake?.schoolYearId ?? year ?? "" },
        })
      }
    />
  );
}
