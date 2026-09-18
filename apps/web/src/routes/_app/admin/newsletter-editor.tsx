import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";

import { NewsletterWorkspace } from "~/components/communication/NewsletterWorkspace";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import {
  newsletterDraftQuery,
  newsletterEditorContextQuery,
} from "~/queries/newsletter-drafts";

export const Route = createFileRoute("/_app/admin/newsletter-editor")({
  staticData: { breadcrumb: m.newsletterDesignTitle },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    year: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(newsletterEditorContextQuery);
    if (deps.id)
      await context.queryClient.ensureQueryData(newsletterDraftQuery(deps.id));
  },
  component: EditorPage,
});
function EditorPage() {
  const { id, year } = Route.useSearch();
  const navigate = Route.useNavigate();
  const close = () => {
    void navigate({ to: "/admin/newsletters" });
  };
  const saved = (draftId: string) => {
    void navigate({
      to: "/admin/newsletter-editor",
      search: { id: draftId },
      replace: true,
    });
  };
  return id ? (
    <Existing key={id} id={id} onClose={close} onSaved={saved} />
  ) : (
    <NewDraft key={year} year={year} onClose={close} onSaved={saved} />
  );
}
function Existing({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { data } = useSuspenseQuery(newsletterDraftQuery(id));
  const {
    data: { years },
  } = useSuspenseQuery(newsletterEditorContextQuery);
  return (
    <NewsletterWorkspace
      initial={{
        id: data.id,
        expectedRevision: data.revision,
        schoolYearId: data.schoolYearId,
        title: data.title,
        summary: data.summary,
        document: data.document,
      }}
      yearName={years.find((year) => year.id === data.schoolYearId)?.name ?? ""}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
function NewDraft({
  year,
  onClose,
  onSaved,
}: {
  year?: string;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const {
    data: { years },
  } = useSuspenseQuery(newsletterEditorContextQuery);
  const selected = year
    ? years.find((item) => item.id === year)
    : years.find((item) => item.isCurrent);
  const [id] = useState(() => crypto.randomUUID());
  if (!selected) return <p role="alert">{m.academicYearNotFound()}</p>;
  return (
    <NewsletterWorkspace
      initial={{
        id,
        expectedRevision: 0,
        schoolYearId: selected.id,
        title: "",
        summary: "",
        document: { version: 1, locale: getLocale(), sections: [] },
      }}
      yearName={selected.name}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
