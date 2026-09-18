import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { AnnouncementEditor } from "~/components/communication/AnnouncementEditor";
import * as m from "~/i18n/messages";
import { announcementQuery } from "~/queries/notifications";

export const Route = createFileRoute("/_app/admin/announcement-editor")({
  staticData: { breadcrumb: m.announcementNew },
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (deps.id)
      await context.queryClient.ensureQueryData(announcementQuery(deps.id));
  },
  component: EditorPage,
});

function EditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const close = () =>
    void navigate({ to: "/announcements", search: { page: 1 } });
  const saved = (announcementId: string) =>
    void navigate({
      to: "/admin/announcement-editor",
      search: { id: announcementId },
      replace: true,
    });
  const published = (announcementId: string) =>
    void navigate({
      to: "/announcements/$announcementId",
      params: { announcementId },
    });
  return id ? (
    <Existing
      key={id}
      id={id}
      onClose={close}
      onSaved={saved}
      onPublished={published}
    />
  ) : (
    <AnnouncementEditor
      key="new"
      initial={null}
      onClose={close}
      onSaved={saved}
      onPublished={published}
    />
  );
}

function Existing({
  id,
  ...props
}: {
  id: string;
  onClose: () => void;
  onSaved: (id: string) => void;
  onPublished: (id: string) => void;
}) {
  const { data } = useSuspenseQuery(announcementQuery(id));
  return <AnnouncementEditor initial={data} {...props} />;
}
