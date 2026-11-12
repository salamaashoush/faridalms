import { BreadcrumbCurrent } from "@faridalms/ui/system/app-shell";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import {
  IntakeEditor,
  intakeDraft,
} from "~/components/admissions/IntakeEditor";
import { useIntakeParts } from "~/components/admissions/parts";
import { intakeParts } from "~/components/admissions/slots";
import * as m from "~/i18n/messages";
import { intakeOptionsQuery, intakeQuery } from "~/queries/admissions";
import { currentUserQuery } from "~/queries/user";
import { filled } from "~/utils/extension";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/admissions/intake-editor")({
  staticData: {
    trail: <BreadcrumbCurrent>{m.itkEditorCrumb()}</BreadcrumbCurrent>,
    section: "/admissions/intakes",
  },
  // Loose, so the view of a module the form was opened from rides along.
  validateSearch: v.looseObject({
    id: v.optional(v.pipe(v.string(), v.uuid())),
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
      ...filled(context.extensions, user.modules, intakeParts).map((part) =>
        context.queryClient.ensureQueryData(part.query()),
      ),
    ]);
  },
  component: IntakeEditorPage,
});

function IntakeEditorPage() {
  const search = Route.useSearch();
  const { id } = search;
  const navigate = Route.useNavigate();
  const options = useSuspenseQuery(intakeOptionsQuery).data;
  const parts = useIntakeParts(search);
  const intake = useQuery({
    ...intakeQuery(id ?? ""),
    enabled: Boolean(id),
  }).data;
  if (id && !intake) return null;
  return (
    <IntakeEditor
      key={`${intake?.id ?? "new"}:${String(intake?.version ?? 0)}`}
      options={options}
      parts={parts}
      initial={intakeDraft(options, parts, intake)}
      onDone={() => void navigate({ to: "/admissions/intakes", search: {} })}
    />
  );
}
