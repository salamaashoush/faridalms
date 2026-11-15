import { createFileRoute } from "@tanstack/react-router";

import { AgreementPage } from "../components/AgreementPage";
import { getAgreementText } from "../server/agreements";

export const Route = createFileRoute("/legal/$kind/")({
  loader: ({ params }) => getAgreementText({ data: { kind: params.kind } }),
  head: () => ({ meta: [{ title: "Agreement" }] }),
  component: AgreementInForcePage,
});

/** The version of an agreement in force today. */
function AgreementInForcePage() {
  return <AgreementPage text={Route.useLoaderData()} />;
}
