import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import * as v from "valibot";

import { ConsentFormEditor } from "~/components/consents/ConsentFormEditor";
import * as m from "~/i18n/messages";
import { consentFormQuery } from "~/queries/consents";
import { templateQuery } from "~/queries/library";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/consent-form-editor")({
  staticData: { breadcrumb: m.consentFormEditing, section: "/privacy" },
  validateSearch: v.object({
    purpose: v.pipe(v.string(), v.uuid()),
    /** A library piece the form starts from, while it says nothing yet. */
    template: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("privacy:manage"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await Promise.all([
      context.queryClient.ensureQueryData(consentFormQuery(deps.purpose)),
      ...(deps.template
        ? [context.queryClient.ensureQueryData(templateQuery(deps.template))]
        : []),
    ]);
  },
  component: EditorPage,
});

function Started({
  template,
  data,
  onClose,
}: {
  template: string;
  data: Parameters<typeof ConsentFormEditor>[0]["data"];
  onClose: () => void;
}) {
  const piece = useSuspenseQuery(templateQuery(template)).data;
  return <ConsentFormEditor data={data} template={piece} onClose={onClose} />;
}

function EditorPage() {
  const { purpose, template } = Route.useSearch();
  const navigate = Route.useNavigate();
  const data = useSuspenseQuery(consentFormQuery(purpose)).data;
  const close = () =>
    void navigate({ to: "/privacy", search: { tab: "consents" } });
  return template ? (
    <Started key={purpose} template={template} data={data} onClose={close} />
  ) : (
    <ConsentFormEditor key={purpose} data={data} onClose={close} />
  );
}
