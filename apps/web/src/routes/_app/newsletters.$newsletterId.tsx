import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "~/components/app/primitives";
import { NewsletterDocument } from "~/components/communication/NewsletterDocument";
import * as m from "~/i18n/messages";
import { newsletterQuery } from "~/queries/notifications";
import { formatDate } from "~/utils/datetime";

export const Route = createFileRoute("/_app/newsletters/$newsletterId")({
  staticData: { breadcrumb: m.newslettersTitle },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(newsletterQuery(params.newsletterId)),
  component: NewsletterPage,
});

function NewsletterPage() {
  const { newsletterId } = Route.useParams();
  const { data } = useSuspenseQuery(newsletterQuery(newsletterId));
  return (
    <>
      <PageHeader
        title={data.title}
        description={formatDate(data.publishedOn)}
      />
      {data.document ? (
        <NewsletterDocument
          document={data.document}
          title={data.title}
          summary={data.summary ?? ""}
        />
      ) : data.url ? (
        <p className="rounded-xl border bg-card p-6 text-sm">
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            {m.newslettersOpen()}
          </a>
        </p>
      ) : null}
    </>
  );
}
