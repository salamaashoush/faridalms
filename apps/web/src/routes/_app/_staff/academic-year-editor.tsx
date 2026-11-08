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

import { yearTitle } from "~/components/years/format";
import { YearEditor } from "~/components/years/YearEditor";
import * as m from "~/i18n/messages";
import { currentUserQuery } from "~/queries/user";
import { yearQuery } from "~/queries/years";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/_staff/academic-year-editor")({
  staticData: {
    trail: <EditorTrail />,
    section: "/academic-years",
  },
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "years:manage");
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

interface EditTrailProps {
  yearId: string;
}

function EditTrail({ yearId }: EditTrailProps) {
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

interface ExistingYearProps {
  id: string;
  onClose: (id?: string) => void;
}

function ExistingYear({ id, onClose }: ExistingYearProps) {
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
    void navigate({ to: "/academic-years" });
  };
  return id ? (
    <ExistingYear id={id} onClose={close} />
  ) : (
    <YearEditor onClose={close} />
  );
}
