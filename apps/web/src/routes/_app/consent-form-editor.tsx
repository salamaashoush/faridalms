import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import * as v from "valibot";

import { ConsentFormEditor } from "~/components/consents/ConsentFormEditor";
import * as m from "~/i18n/messages";
import { consentFormQuery } from "~/queries/consents";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/consent-form-editor")({
  staticData: { breadcrumb: m.consentFormEditing, section: "/privacy" },
  validateSearch: v.object({ purpose: v.pipe(v.string(), v.uuid()) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("privacy:manage"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await context.queryClient.ensureQueryData(consentFormQuery(deps.purpose));
  },
  component: EditorPage,
});

function EditorPage() {
  const { purpose } = Route.useSearch();
  const navigate = Route.useNavigate();
  const data = useSuspenseQuery(consentFormQuery(purpose)).data;
  return (
    <ConsentFormEditor
      key={purpose}
      data={data}
      onClose={() =>
        void navigate({ to: "/privacy", search: { tab: "consents" } })
      }
    />
  );
}
