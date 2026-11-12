import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { createFileRoute } from "@tanstack/react-router";

import { LearnerConsents } from "~/components/consents/LearnerConsents";
import * as m from "~/i18n/messages";
import { myConsentsQuery } from "~/queries/consents";

export const Route = createFileRoute("/_app/me/consents")({
  loader: ({ context }) => context.queryClient.ensureQueryData(myConsentsQuery),
  component: MyConsentsPage,
});

function MyConsentsPage() {
  return (
    <Page width="list">
      <PageHeader title={m.navConsents()} description={m.myConsentsHint()} />
      <LearnerConsents />
    </Page>
  );
}
