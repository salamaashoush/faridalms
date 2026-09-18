import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Pencil } from "lucide-react";

import { ButtonLink } from "~/components/app/ButtonLink";
import { PageHeader } from "~/components/app/primitives";
import { AUDIENCE_LABEL } from "~/components/communication/announcement-labels";
import { ContentView } from "~/components/content/ContentView";
import { Badge } from "~/components/ui/badge";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { announcementQuery } from "~/queries/notifications";
import { formatDateTime } from "~/utils/datetime";

export const Route = createFileRoute("/_app/announcements/$announcementId")({
  staticData: { breadcrumb: m.announcementsTitle },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      announcementQuery(params.announcementId),
    ),
  component: AnnouncementPage,
});

function AnnouncementPage() {
  const { announcementId } = Route.useParams();
  const user = useCurrentUser();
  const { data } = useSuspenseQuery(announcementQuery(announcementId));
  return (
    <>
      <PageHeader
        title={data.title || m.announcementUntitled()}
        description={[
          data.author?.name,
          data.publishedAt
            ? formatDateTime(data.publishedAt.toISOString())
            : m.assignmentStatusDraft(),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Badge variant="outline">{AUDIENCE_LABEL[data.audience]()}</Badge>
            {data.canManage && user.role === "admin" ? (
              <ButtonLink
                to="/admin/announcement-editor"
                search={{ id: data.id }}
              >
                <Pencil className="size-4" aria-hidden />
                {m.managementEdit()}
              </ButtonLink>
            ) : null}
          </>
        }
      />
      <article className="rounded-xl border bg-card p-5 sm:p-8">
        <ContentView document={data.document} />
      </article>
    </>
  );
}
