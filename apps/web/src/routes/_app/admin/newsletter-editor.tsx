import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { NewsletterEditor } from "~/components/newsletters/NewsletterEditor";
import * as m from "~/i18n/messages";
import {
  newsletterEditorQuery,
  newsletterOptionsQuery,
} from "~/queries/newsletters";

export const Route = createFileRoute("/_app/admin/newsletter-editor")({
  staticData: { breadcrumb: m.nlEditorBreadcrumb, section: "/newsletters" },
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(newsletterOptionsQuery),
      ...(deps.id
        ? [context.queryClient.ensureQueryData(newsletterEditorQuery(deps.id))]
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
  const existing = useSuspenseQuery(newsletterEditorQuery(id)).data;
  return (
    <NewsletterEditor
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
          to: "/newsletters/$newsletterId",
          params: { newsletterId: saved },
        })
      : navigate({ to: "/newsletters", search: {} }));
  return id ? (
    <Existing id={id} onClose={close} />
  ) : (
    <NewsletterEditor existing={null} onClose={close} />
  );
}
