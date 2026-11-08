import {
  BreadcrumbCurrent,
  BreadcrumbStep,
} from "@faridalms/ui/system/app-shell";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  useCanGoBack,
  useRouter,
} from "@tanstack/react-router";
import * as v from "valibot";

import { PlanEditor } from "~/components/learning/PlanEditor";
import * as m from "~/i18n/messages";
import { collaborationQuery } from "~/queries/documents";
import { moduleRecordQuery, planQuery } from "~/queries/learning";
import { templateQuery } from "~/queries/library";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/_staff/module-plan")({
  staticData: { trail: <PlanTrail />, section: "/modules" },
  validateSearch: v.object({
    moduleId: v.pipe(v.string(), v.uuid()),
    /** A library piece the plan starts from while it is unwritten. */
    template: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "learning:author");
    const [, plan] = await Promise.all([
      context.queryClient.ensureQueryData(moduleRecordQuery(deps.moduleId)),
      context.queryClient.ensureQueryData(planQuery(deps.moduleId)),
    ]);
    if (plan.content)
      await context.queryClient.prefetchQuery(
        collaborationQuery({ hostType: "module_plan", hostId: deps.moduleId }),
      );
    else if (deps.template)
      await context.queryClient.ensureQueryData(templateQuery(deps.template));
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

interface StartedEditorProps {
  moduleId: string;
  template: string;
  onClose: () => void;
}

function StartedEditor({ moduleId, template, onClose }: StartedEditorProps) {
  const piece = useSuspenseQuery(templateQuery(template)).data;
  return <PlanEditor moduleId={moduleId} template={piece} onClose={onClose} />;
}

function PlanPage() {
  const { moduleId, template } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const plan = useSuspenseQuery(planQuery(moduleId)).data;
  const close = () => {
    if (canGoBack) {
      router.history.back();
      return;
    }
    void navigate({
      to: "/modules/$moduleId",
      params: { moduleId },
      search: { tab: "plan" },
    });
  };
  return template && !plan.content ? (
    <StartedEditor moduleId={moduleId} template={template} onClose={close} />
  ) : (
    <PlanEditor moduleId={moduleId} onClose={close} />
  );
}
