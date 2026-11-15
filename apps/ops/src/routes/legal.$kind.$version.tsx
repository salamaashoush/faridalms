import { createFileRoute } from "@tanstack/react-router";

import { AgreementPage } from "../components/AgreementPage";
import { getAgreementText } from "../server/agreements";

export const Route = createFileRoute("/legal/$kind/$version")({
  loader: ({ params }) =>
    getAgreementText({ data: { kind: params.kind, version: params.version } }),
  head: () => ({ meta: [{ title: "Agreement" }] }),
  component: AgreementVersionPage,
});

function AgreementVersionPage() {
  return <AgreementPage text={Route.useLoaderData()} />;
}
