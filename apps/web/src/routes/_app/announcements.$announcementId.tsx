import { createFileRoute } from "@tanstack/react-router";

import {
  BroadcastRecord,
  BroadcastTrail,
} from "~/components/broadcasts/BroadcastRecord";
import { announcementQuery } from "~/queries/announcements";

export const Route = createFileRoute("/_app/announcements/$announcementId")({
  staticData: { trail: <AnnouncementTrail />, section: "/announcements" },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      announcementQuery(params.announcementId),
    ),
  component: AnnouncementPage,
});

function AnnouncementTrail() {
  const { announcementId } = Route.useParams();
  return <BroadcastTrail kind="announcement" id={announcementId} />;
}

function AnnouncementPage() {
  const { announcementId } = Route.useParams();
  return <BroadcastRecord kind="announcement" id={announcementId} />;
}
