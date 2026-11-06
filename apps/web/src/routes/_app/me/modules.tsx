import { PageHeader } from "@faridalms/ui/system/page-header";
import { createFileRoute } from "@tanstack/react-router";

import { StudentModuleList } from "~/components/learning/StudentModules";
import * as m from "~/i18n/messages";
import { myModulesQuery } from "~/queries/learning";

export const Route = createFileRoute("/_app/me/modules")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(myModulesQuery("")),
  component: MyModulesPage,
});

function MyModulesPage() {
  return (
    <>
      <PageHeader title={m.navModules()} description={m.lrnMeHint()} />
      <StudentModuleList studentId="" />
    </>
  );
}
