import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
  onCreated,
}: {
  id: string;
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}) {
  const existing = useSuspenseQuery(newsletterEditorQuery(id)).data;
  return (
    <NewsletterEditor
      key={existing.id}
      existing={existing}
      onClose={onClose}
      onCreated={onCreated}
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
  // The first autosave gives a new edition its address, so a reload reopens
  // it; the editor already open stays mounted with what is being typed.
  const [started, setStarted] = useState<string | null>(null);
  const created = (saved: string) => {
    setStarted(saved);
    void navigate({ search: { id: saved }, replace: true });
  };
  return id && id !== started ? (
    <Existing id={id} onClose={close} onCreated={created} />
  ) : (
    <NewsletterEditor existing={null} onClose={close} onCreated={created} />
  );
}
