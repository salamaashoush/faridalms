import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "~/components/app/primitives";
import { ModuleList } from "~/components/learning/ModuleList";
import * as m from "~/i18n/messages";
import { learnerModulesQuery } from "~/queries/learning";

export const Route = createFileRoute("/_app/me/modules")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(learnerModulesQuery("")),
  component: MyModulesPage,
});
function MyModulesPage() {
  const { data } = useSuspenseQuery(learnerModulesQuery(""));
  return (
    <>
      <PageHeader title={m.navModules()} description={m.learningMeHint()} />
      <ModuleList rows={data.rows} studentId={data.studentId} />
    </>
  );
}
