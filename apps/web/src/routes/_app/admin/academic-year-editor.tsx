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
import { yearTitle } from "~/components/years/format";
import { YearEditor } from "~/components/years/YearEditor";
import * as m from "~/i18n/messages";
import { currentUserQuery } from "~/queries/user";
import { yearQuery } from "~/queries/years";

export const Route = createFileRoute("/_app/admin/academic-year-editor")({
  staticData: {
    trail: <EditorTrail />,
    section: "/admin/academic-years",
  },
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("years:manage"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    if (deps.id) await context.queryClient.ensureQueryData(yearQuery(deps.id));
  },
  component: YearEditorPage,
});

function EditorTrail() {
  const { id } = Route.useSearch();
  return id ? (
    <EditTrail yearId={id} />
  ) : (
    <BreadcrumbCurrent>{m.yearsAdd()}</BreadcrumbCurrent>
  );
}

function EditTrail({ yearId }: { yearId: string }) {
  const year = useSuspenseQuery(yearQuery(yearId)).data;
  return (
    <>
      <BreadcrumbStep
        render={<Link to="/years/$yearId" params={{ yearId }} search={{}} />}
      >
        {yearTitle(year)}
      </BreadcrumbStep>
      <BreadcrumbCurrent>{m.yearsEdit()}</BreadcrumbCurrent>
    </>
  );
}

function ExistingYear({
  id,
  onClose,
}: {
  id: string;
  onClose: (id?: string) => void;
}) {
  const year = useSuspenseQuery(yearQuery(id)).data;
  return <YearEditor key={year.id} year={year} onClose={onClose} />;
}

function YearEditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const close = (saved?: string) => {
    if (!id && saved) {
      void navigate({
        to: "/years/$yearId",
        params: { yearId: saved },
        search: {},
        replace: true,
      });
      return;
    }
    if (canGoBack) {
      router.history.back();
      return;
    }
    void navigate({ to: "/admin/academic-years" });
  };
  return id ? (
    <ExistingYear id={id} onClose={close} />
  ) : (
    <YearEditor onClose={close} />
  );
}
