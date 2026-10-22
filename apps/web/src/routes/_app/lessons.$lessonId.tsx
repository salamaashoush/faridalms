import type { ErrorComponentProps } from "@tanstack/react-router";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { ButtonLink } from "~/components/app/ButtonLink";
import {
  BreadcrumbCurrent,
  BreadcrumbStep,
} from "~/components/app/WorkspaceBreadcrumb";
import { LtiHostProvider } from "~/components/content/lti";
import { DefaultCatchBoundary } from "~/components/DefaultCatchBoundary";
import {
  LessonPlayer,
  LessonPreview,
} from "~/components/learning/LessonPlayer";
import { EmptyState } from "~/components/system/IndexPage";
import * as m from "~/i18n/messages";
import { lessonEditorQuery, lessonQuery } from "~/queries/learning";

const learns = (workspace: string | null) => workspace === "me";

/** A student works through a lesson here; its teacher previews it. */
export const Route = createFileRoute("/_app/lessons/$lessonId")({
  staticData: {
    trail: <LessonTrail />,
    section: ["/teach/modules", "/me/modules"],
  },
  loader: async ({ context, params, preload }) => {
    if (learns(context.auth.workspace)) {
      // Opening a lesson starts it and may finish it, so a link merely
      // pointed at must not open it ahead of the click.
      if (!preload)
        await context.queryClient.ensureQueryData(lessonQuery(params.lessonId));
    } else
      await context.queryClient.ensureQueryData(
        lessonEditorQuery(params.lessonId),
      );
  },
  component: LessonPage,
  errorComponent: LessonError,
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
  // A locked lesson fails to open; the page explains why and the trail stays empty.
  const { data } = useQuery({ ...lessonQuery(id), retry: false });
  return data ? <Trail module={data.module} title={data.title} /> : null;
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
  return (
    <LtiHostProvider type="lesson" id={lessonId}>
      {learns(auth.workspace) ? (
        <LessonPlayer key={lessonId} lessonId={lessonId} />
      ) : (
        <LessonPreview lessonId={lessonId} />
      )}
    </LtiHostProvider>
  );
}

/** A lesson that is not open yet says so and points back to the modules. */
function LessonError(props: ErrorComponentProps) {
  if (
    !(props.error instanceof Error) ||
    props.error.message !== "learning.locked"
  )
    return <DefaultCatchBoundary {...props} />;
  return (
    <div className="mx-auto w-full max-w-3xl">
      <EmptyState
        icon={Lock}
        title={m.lrnLockedTitle()}
        description={m.lrnErrLocked()}
        action={
          <ButtonLink to="/me/modules" search={{}} className="max-md:h-10">
            {m.lrnBackToModules()}
          </ButtonLink>
        }
      />
    </div>
  );
}
