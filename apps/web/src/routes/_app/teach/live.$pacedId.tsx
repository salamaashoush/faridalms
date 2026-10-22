import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import {
  BreadcrumbCurrent,
  BreadcrumbStep,
} from "~/components/app/WorkspaceBreadcrumb";
import { PacedLesson } from "~/components/learning/PacedLesson";
import * as m from "~/i18n/messages";
import { pacedQuery } from "~/queries/learning";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/teach/live/$pacedId")({
  staticData: { trail: <LiveTrail />, section: "/teach/modules" },
  loader: async ({ context, params }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("learning:author"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await context.queryClient.ensureQueryData(pacedQuery(params.pacedId));
  },
  component: LivePage,
});

function LiveTrail() {
  const { pacedId } = Route.useParams();
  const data = useSuspenseQuery(pacedQuery(pacedId)).data;
  return (
    <>
      <BreadcrumbStep
        render={
          <Link
            to="/modules/$moduleId"
            params={{ moduleId: data.lesson.moduleId }}
            search={{}}
          />
        }
      >
        {data.lesson.moduleTitle}
      </BreadcrumbStep>
      <BreadcrumbCurrent>{m.lrnPacedLive()}</BreadcrumbCurrent>
    </>
  );
}

function LivePage() {
  const { pacedId } = Route.useParams();
  return <PacedLesson pacedId={pacedId} />;
}
