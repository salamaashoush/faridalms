import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import * as v from "valibot";

import { BreadcrumbCurrent } from "~/components/app/WorkspaceBreadcrumb";
import { PostEditor } from "~/components/site/PostEditor";
import * as m from "~/i18n/messages";
import { sitePostOptionsQuery, sitePostQuery } from "~/queries/site";
import { currentUserQuery } from "~/queries/user";

export const Route = createFileRoute("/_app/admin/site-post-editor")({
  staticData: { trail: <EditorTrail />, section: "/admin/site" },
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => ({ id: search.id }),
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("site:manage"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await Promise.all([
      context.queryClient.ensureQueryData(sitePostOptionsQuery),
      deps.id
        ? context.queryClient.ensureQueryData(sitePostQuery(deps.id))
        : null,
    ]);
  },
  component: EditorPage,
});

function EditorTrail() {
  const { id } = Route.useSearch();
  return (
    <BreadcrumbCurrent>
      {id ? m.siteEditPost() : m.siteNewPost()}
    </BreadcrumbCurrent>
  );
}

function ExistingEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const existing = useSuspenseQuery(sitePostQuery(id)).data;
  const options = useSuspenseQuery(sitePostOptionsQuery).data;
  return (
    <PostEditor
      key={`${existing.id}-${existing.version}-${existing.revision}`}
      existing={existing}
      options={options}
      onClose={onClose}
    />
  );
}

function EditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const options = useSuspenseQuery(sitePostOptionsQuery).data;
  const close = () => {
    void navigate({ to: "/admin/site", search: { tab: "posts" } });
  };
  return id ? (
    <ExistingEditor id={id} onClose={close} />
  ) : (
    <PostEditor existing={null} options={options} onClose={close} />
  );
}
