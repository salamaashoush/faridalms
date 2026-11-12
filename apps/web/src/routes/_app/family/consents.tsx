import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { createFileRoute } from "@tanstack/react-router";

import { LearnerConsents } from "~/components/consents/LearnerConsents";
import * as m from "~/i18n/messages";
import { myConsentsQuery } from "~/queries/consents";

export const Route = createFileRoute("/_app/family/consents")({
  loader: ({ context }) => context.queryClient.ensureQueryData(myConsentsQuery),
  component: ConsentsPage,
});

function ConsentsPage() {
  return (
    <Page width="list">
      <PageHeader title={m.navConsents()} description={m.consentFamilyHint()} />
      <LearnerConsents />
    </Page>
  );
}
