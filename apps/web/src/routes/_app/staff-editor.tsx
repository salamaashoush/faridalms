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
import { displayName } from "~/components/people/format";
import {
  ExistingStaffEditor,
  StaffEditor,
} from "~/components/people/StaffEditor";
import * as m from "~/i18n/messages";
import { staffMemberQuery } from "~/queries/staff";
import { peopleOptionsQuery } from "~/queries/students";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/staff-editor")({
  staticData: {
    trail: <EditorTrail />,
    section: "/admin/staff",
  },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    // Set by the list or the record, so leaving returns there.
    from: v.optional(v.picklist(["list", "record"])),
  }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("staff:manage"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await Promise.all([
      context.queryClient.ensureQueryData(peopleOptionsQuery),
      deps.id
        ? context.queryClient.ensureQueryData(staffMemberQuery(deps.id))
        : null,
    ]);
  },
  component: StaffEditorPage,
});

function EditorTrail() {
  const { id } = Route.useSearch();
  return id ? (
    <EditTrail userId={id} />
  ) : (
    <BreadcrumbCurrent>{m.staffAdd()}</BreadcrumbCurrent>
  );
}

function EditTrail({ userId }: { userId: string }) {
  const member = useSuspenseQuery(staffMemberQuery(userId)).data;
  return (
    <>
      <BreadcrumbStep
        render={<Link to="/people/$userId" params={{ userId }} search={{}} />}
      >
        {displayName(member)}
      </BreadcrumbStep>
      <BreadcrumbCurrent>{m.staffEdit()}</BreadcrumbCurrent>
    </>
  );
}

function StaffEditorPage() {
  const { id, from } = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const close = () => {
    if (from && canGoBack) {
      router.history.back();
      return;
    }
    void (id
      ? navigate({ to: "/people/$userId", params: { userId: id }, search: {} })
      : navigate({ to: "/admin/staff", search: {} }));
  };
  return id ? (
    <ExistingStaffEditor key={id} id={id} onClose={close} />
  ) : (
    <StaffEditor onClose={close} />
  );
}
