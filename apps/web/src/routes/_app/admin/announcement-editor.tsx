import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { AnnouncementEditor } from "~/components/announcements/AnnouncementEditor";
import * as m from "~/i18n/messages";
import {
  announcementEditorQuery,
  announcementOptionsQuery,
} from "~/queries/announcements";

export const Route = createFileRoute("/_app/admin/announcement-editor")({
  staticData: { breadcrumb: m.annEditorBreadcrumb, section: "/announcements" },
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(announcementOptionsQuery),
      ...(deps.id
        ? [
            context.queryClient.ensureQueryData(
              announcementEditorQuery(deps.id),
            ),
          ]
        : []),
    ]);
  },
  component: EditorPage,
});

function Existing({
  id,
  onClose,
}: {
  id: string;
  onClose: (id?: string) => void;
}) {
  const existing = useSuspenseQuery(announcementEditorQuery(id)).data;
  return (
    <AnnouncementEditor
      key={existing.version}
      existing={existing}
      onClose={onClose}
    />
  );
}

function EditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const close = (saved?: string) =>
    void (saved
      ? navigate({
          to: "/announcements/$announcementId",
          params: { announcementId: saved },
        })
      : navigate({ to: "/announcements", search: {} }));
  return id ? (
    <Existing id={id} onClose={close} />
  ) : (
    <AnnouncementEditor existing={null} onClose={close} />
  );
}
