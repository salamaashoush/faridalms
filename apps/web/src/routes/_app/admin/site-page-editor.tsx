import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";

import { SitePageWorkspace } from "~/components/site/SitePageWorkspace";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { sitePageQuery, siteSettingsQuery } from "~/queries/site";

export const Route = createFileRoute("/_app/admin/site-page-editor")({
  staticData: { breadcrumb: m.sitePageDesign },
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(siteSettingsQuery);
    if (deps.id)
      await context.queryClient.ensureQueryData(sitePageQuery(deps.id));
  },
  component: EditorPage,
});
function EditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: settings } = useSuspenseQuery(siteSettingsQuery);
  const close = () => {
    void navigate({ to: "/admin/site", search: { tab: "pages" } });
  };
  const saved = (pageId: string) => {
    void navigate({
      to: "/admin/site-page-editor",
      search: { id: pageId },
      replace: true,
    });
  };
  return id ? (
    <Existing
      key={id}
      id={id}
      school={settings.school.slug}
      onClose={close}
      onSaved={saved}
    />
  ) : (
    <NewPage school={settings.school.slug} onClose={close} onSaved={saved} />
  );
}
function Existing({
  id,
  school,
  onClose,
  onSaved,
}: {
  id: string;
  school: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { data } = useSuspenseQuery(sitePageQuery(id));
  return (
    <SitePageWorkspace
      initial={{
        id: data.id,
        expectedRevision: data.revision,
        slug: data.slug,
        locale: data.locale,
        title: data.title,
        summary: data.summary,
        navGroup: data.navGroup,
        navOrder: data.navOrder,
        showInNav: data.showInNav,
        document: data.document,
      }}
      status={data.status}
      school={school}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
function NewPage({
  school,
  onClose,
  onSaved,
}: {
  school: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  return (
    <SitePageWorkspace
      initial={{
        id,
        expectedRevision: 0,
        slug: "",
        locale: getLocale(),
        title: "",
        summary: "",
        navGroup: "",
        navOrder: 0,
        showInNav: true,
        document: { version: 1, locale: getLocale(), sections: [] },
      }}
      status="draft"
      school={school}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
