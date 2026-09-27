import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import {
  BreadcrumbCurrent,
  BreadcrumbStep,
} from "~/components/app/WorkspaceBreadcrumb";
import {
  LessonPlayer,
  LessonPreview,
} from "~/components/learning/LessonPlayer";
import { lessonEditorQuery, lessonQuery } from "~/queries/learning";

const learns = (workspace: string | null) => workspace === "me";

/** A student works through a lesson here; its teacher previews it. */
export const Route = createFileRoute("/_app/lessons/$lessonId")({
  staticData: {
    trail: <LessonTrail />,
    section: ["/teach/modules", "/me/modules"],
  },
  loader: async ({ context, params }) => {
    if (learns(context.auth.workspace))
      await context.queryClient.ensureQueryData(lessonQuery(params.lessonId));
    else
      await context.queryClient.ensureQueryData(
        lessonEditorQuery(params.lessonId),
      );
  },
  component: LessonPage,
});

function Trail({
  module,
  title,
}: {
  module: { id: string; title: string };
  title: string;
}) {
  return (
    <>
      <BreadcrumbStep
        render={
          <Link
            to="/modules/$moduleId"
            params={{ moduleId: module.id }}
            search={{}}
          />
        }
      >
        {module.title}
      </BreadcrumbStep>
      <BreadcrumbCurrent>{title}</BreadcrumbCurrent>
    </>
  );
}

function PlayerTrail({ id }: { id: string }) {
  const data = useSuspenseQuery(lessonQuery(id)).data;
  return <Trail module={data.module} title={data.title} />;
}

function PreviewTrail({ id }: { id: string }) {
  const data = useSuspenseQuery(lessonEditorQuery(id)).data;
  return <Trail module={data.module} title={data.title} />;
}

function LessonTrail() {
  const { lessonId } = Route.useParams();
  const { auth } = Route.useRouteContext();
  return learns(auth.workspace) ? (
    <PlayerTrail id={lessonId} />
  ) : (
    <PreviewTrail id={lessonId} />
  );
}

function LessonPage() {
  const { lessonId } = Route.useParams();
  const { auth } = Route.useRouteContext();
  return learns(auth.workspace) ? (
    <LessonPlayer key={lessonId} lessonId={lessonId} />
  ) : (
    <LessonPreview lessonId={lessonId} />
  );
}
