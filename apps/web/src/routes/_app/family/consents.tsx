import { createFileRoute } from "@tanstack/react-router";

import { FamilyConsents } from "~/components/consents/FamilyConsents";
import { PageHeader } from "~/components/system/IndexPage";
import * as m from "~/i18n/messages";
import { familyConsentsQuery } from "~/queries/consents";

export const Route = createFileRoute("/_app/family/consents")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(familyConsentsQuery),
  component: ConsentsPage,
});

function ConsentsPage() {
  return (
    <>
      <PageHeader title={m.navConsents()} description={m.consentFamilyHint()} />
      <FamilyConsents />
    </>
  );
}
