import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";

import { AnnouncementEditor } from "~/components/communication/AnnouncementEditor";
import * as m from "~/i18n/messages";
import { announcementQuery } from "~/queries/notifications";

export const Route = createFileRoute("/_app/admin/announcement-editor")({
  staticData: { breadcrumb: m.announcementNew, section: "/announcements" },
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
  // A new announcement gets its address once its first draft is saved; the
  // editor that created it stays mounted so typing is never interrupted.
  const [created, setCreated] = useState<string | null>(null);
  const close = () =>
    void navigate({ to: "/announcements", search: { page: 1 } });
  const onCreated = (announcementId: string) => {
    setCreated(announcementId);
    void navigate({
      to: "/admin/announcement-editor",
      search: { id: announcementId },
      replace: true,
    });
  };
  const onPublished = (announcementId: string) =>
    void navigate({
      to: "/announcements/$announcementId",
      params: { announcementId },
    });
  return id && id !== created ? (
    <Existing
      key={id}
      id={id}
      onClose={close}
      onCreated={onCreated}
      onPublished={onPublished}
    />
  ) : (
    <AnnouncementEditor
      key="new"
      initial={null}
      onClose={close}
      onCreated={onCreated}
      onPublished={onPublished}
    />
  );
}

function Existing({
  id,
  ...props
}: {
  id: string;
  onClose: () => void;
  onCreated: (id: string) => void;
  onPublished: (id: string) => void;
}) {
  const { data } = useSuspenseQuery(announcementQuery(id));
  return <AnnouncementEditor initial={data} {...props} />;
}
