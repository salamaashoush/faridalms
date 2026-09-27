import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import * as v from "valibot";

import { BreadcrumbCurrent } from "~/components/app/WorkspaceBreadcrumb";
import { PageEditor } from "~/components/site/PageEditor";
import * as m from "~/i18n/messages";
import { siteOverviewQuery, sitePageQuery } from "~/queries/site";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/admin/site-page-editor")({
  staticData: { trail: <EditorTrail />, section: "/admin/site" },
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("site:manage"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await Promise.all([
      context.queryClient.ensureQueryData(siteOverviewQuery),
      deps.id
        ? context.queryClient.ensureQueryData(sitePageQuery(deps.id))
        : null,
    ]);
  },
  component: EditorPage,
});

function EditorTrail() {
  const { id } = Route.useSearch();
  return (
    <BreadcrumbCurrent>
      {id ? m.siteEditPage() : m.siteNewPage()}
    </BreadcrumbCurrent>
  );
}

function ExistingEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const existing = useSuspenseQuery(sitePageQuery(id)).data;
  const overview = useSuspenseQuery(siteOverviewQuery).data;
  return (
    <PageEditor
      key={`${existing.id}-${existing.version}-${existing.revision}`}
      existing={existing}
      overview={overview}
      onClose={onClose}
    />
  );
}

function EditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const overview = useSuspenseQuery(siteOverviewQuery).data;
  const close = () => {
    void navigate({ to: "/admin/site", search: {} });
  };
  return id ? (
    <ExistingEditor id={id} onClose={close} />
  ) : (
    <PageEditor existing={null} overview={overview} onClose={close} />
  );
}
