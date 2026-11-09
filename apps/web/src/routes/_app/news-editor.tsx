import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import {
  BroadcastEditorPage,
  loadBroadcastEditor,
} from "~/components/broadcasts/BroadcastEditorPage";
import * as m from "~/i18n/messages";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/news-editor")({
  staticData: { breadcrumb: m.newsEditorBreadcrumb, section: "/news" },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    /** A template a new one starts from. */
    template: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    requirePage(
      await context.queryClient.ensureQueryData(currentUserQuery),
      "news:manage",
    );
    await loadBroadcastEditor("news", context.queryClient, deps);
  },
  component: EditorPage,
});

function EditorPage() {
  const { id, template } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <BroadcastEditorPage
      kind="news"
      id={id}
      template={template}
      onClose={(saved) =>
        void (saved
          ? navigate({ to: "/news/$postId", params: { postId: saved } })
          : navigate({ to: "/news", search: {} }))
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
