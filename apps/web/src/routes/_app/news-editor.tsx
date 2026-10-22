import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";

import { NewsEditor } from "~/components/news/NewsEditor";
import * as m from "~/i18n/messages";
import { templateQuery } from "~/queries/library";
import { newsEditorQuery, newsOptionsQuery } from "~/queries/news";

export const Route = createFileRoute("/_app/news-editor")({
  staticData: { breadcrumb: m.newsEditorBreadcrumb, section: "/news" },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    /** A library piece a new one starts from. */
    template: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      ...(deps.template && !deps.id
        ? [context.queryClient.ensureQueryData(templateQuery(deps.template))]
        : []),
      context.queryClient.ensureQueryData(newsOptionsQuery),
      ...(deps.id
        ? [context.queryClient.ensureQueryData(newsEditorQuery(deps.id))]
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
  const existing = useSuspenseQuery(newsEditorQuery(id)).data;
  return (
    <NewsEditor
      key={existing.id}
      existing={existing}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function Started({
  template,
  onClose,
  onCreated,
}: {
  template: string;
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}) {
  const piece = useSuspenseQuery(templateQuery(template)).data;
  return (
    <NewsEditor
      existing={null}
      template={piece}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function EditorPage() {
  const { id, template } = Route.useSearch();
  const navigate = Route.useNavigate();
  const close = (saved?: string) =>
    void (saved
      ? navigate({ to: "/news/$postId", params: { postId: saved } })
      : navigate({ to: "/news", search: {} }));
  // The first autosave gives a new post its address, so a reload reopens it;
  // the editor already open stays mounted with what is being typed.
  const [started, setStarted] = useState<string | null>(null);
  const created = (saved: string) => {
    setStarted(saved);
    void navigate({
      search: (previous) => ({ ...previous, id: saved }),
      replace: true,
    });
  };
  return id && id !== started ? (
    <Existing id={id} onClose={close} onCreated={created} />
  ) : template ? (
    <Started template={template} onClose={close} onCreated={created} />
  ) : (
    <NewsEditor existing={null} onClose={close} onCreated={created} />
  );
}
