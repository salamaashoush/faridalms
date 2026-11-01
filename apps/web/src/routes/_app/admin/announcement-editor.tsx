import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import {
  BroadcastEditorPage,
  loadBroadcastEditor,
} from "~/components/broadcasts/BroadcastEditorPage";
import * as m from "~/i18n/messages";

export const Route = createFileRoute("/_app/admin/announcement-editor")({
  staticData: { breadcrumb: m.annEditorBreadcrumb, section: "/announcements" },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    /** A library piece a new one starts from. */
    template: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    loadBroadcastEditor("announcement", context.queryClient, deps),
  component: EditorPage,
});

function EditorPage() {
  const { id, template } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <BroadcastEditorPage
      kind="announcement"
      id={id}
      template={template}
      onClose={(saved) =>
        void (saved
          ? navigate({
              to: "/announcements/$announcementId",
              params: { announcementId: saved },
            })
          : navigate({ to: "/announcements", search: {} }))
      }
      onAddress={(saved) =>
        void navigate({
          search: (previous) => ({ ...previous, id: saved }),
          replace: true,
        })
      }
    />
  );
}
