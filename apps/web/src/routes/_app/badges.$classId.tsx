import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { BreadcrumbCurrent } from "~/components/app/WorkspaceBreadcrumb";
import { ClassBadges } from "~/components/badges/ClassBadges";
import { classTitle } from "~/components/classes/format";
import { classBadgesQuery } from "~/queries/badges";

export const Route = createFileRoute("/_app/badges/$classId")({
  staticData: {
    trail: <BadgesTrail />,
    section: ["/teach/classes", "/admin/classes"],
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(classBadgesQuery(params.classId)),
  component: BadgesPage,
});

function BadgesTrail() {
  const { classId } = Route.useParams();
  const data = useSuspenseQuery(classBadgesQuery(classId)).data;
  return <BreadcrumbCurrent>{classTitle(data.class)}</BreadcrumbCurrent>;
}

function BadgesPage() {
  const { classId } = Route.useParams();
  return <ClassBadges classId={classId} />;
}
