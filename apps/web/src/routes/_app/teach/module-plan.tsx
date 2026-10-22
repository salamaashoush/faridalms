import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useCanGoBack,
  useRouter,
} from "@tanstack/react-router";
import * as v from "valibot";

import {
  BreadcrumbCurrent,
  BreadcrumbStep,
} from "~/components/app/WorkspaceBreadcrumb";
import { PlanEditor } from "~/components/learning/PlanEditor";
import * as m from "~/i18n/messages";
import { collaborationQuery } from "~/queries/documents";
import { moduleRecordQuery, planQuery } from "~/queries/learning";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/teach/module-plan")({
  staticData: { trail: <PlanTrail />, section: "/teach/modules" },
  validateSearch: v.object({ moduleId: v.pipe(v.string(), v.uuid()) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("learning:author"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    const [, plan] = await Promise.all([
      context.queryClient.ensureQueryData(moduleRecordQuery(deps.moduleId)),
      context.queryClient.ensureQueryData(planQuery(deps.moduleId)),
    ]);
    if (plan.content)
      await context.queryClient.prefetchQuery(
        collaborationQuery({ hostType: "module_plan", hostId: deps.moduleId }),
      );
  },
  component: PlanPage,
});

function PlanTrail() {
  const { moduleId } = Route.useSearch();
  const module = useSuspenseQuery(moduleRecordQuery(moduleId)).data;
  return (
    <>
      <BreadcrumbStep
        render={
          <Link to="/modules/$moduleId" params={{ moduleId }} search={{}} />
        }
      >
        {module.title}
      </BreadcrumbStep>
      <BreadcrumbCurrent>{m.planTitle()}</BreadcrumbCurrent>
    </>
  );
}

function PlanPage() {
  const { moduleId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  return (
    <PlanEditor
      moduleId={moduleId}
      onClose={() => {
        if (canGoBack) {
          router.history.back();
          return;
        }
        void navigate({
          to: "/modules/$moduleId",
          params: { moduleId },
          search: { tab: "plan" },
        });
      }}
    />
  );
}
