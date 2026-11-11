import { createFileRoute } from "@tanstack/react-router";

import {
  AnnouncementRecord,
  AnnouncementTrail,
} from "~/components/announcements/AnnouncementRecord";
import { announcementQuery } from "~/queries/announcements";

export const Route = createFileRoute("/_app/announcements/$announcementId")({
  staticData: { trail: <Trail />, section: "/announcements" },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      announcementQuery(params.announcementId),
    ),
  component: AnnouncementPage,
});

function Trail() {
  const { announcementId } = Route.useParams();
  return <AnnouncementTrail id={announcementId} />;
}

function AnnouncementPage() {
  const { announcementId } = Route.useParams();
  return <AnnouncementRecord id={announcementId} />;
}
