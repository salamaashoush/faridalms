import type { ContentDocument } from "@faridalms/domain/content";

import { LETTER_FIELDS } from "@faridalms/domain/admissions";
import { BreadcrumbCurrent } from "@faridalms/ui/system/app-shell";
import { UnsavedChangesGuard } from "@faridalms/ui/system/unsaved-changes-guard";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import * as v from "valibot";

import { ContentEditor } from "~/components/content/ContentEditor";
import {
  DocumentVersion,
  documentText,
  useHeldDocument,
} from "~/components/content/held-document";
import {
  DetailsPanel,
  DetailsSection,
  DocumentPage,
  DocumentTitle,
} from "~/components/system/DocumentPage";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { lettersQuery } from "~/queries/admissions";
import { templateQuery } from "~/queries/templates";
import { currentUserQuery } from "~/queries/user";
import {
  listTemplates,
  openTemplate,
  updateTemplate,
} from "~/server/templates";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/admissions/letter-editor")({
  staticData: {
    trail: <BreadcrumbCurrent>{m.ltrEditorCrumb()}</BreadcrumbCurrent>,
    section: "/admissions/letters",
  },
  validateSearch: v.object({ id: v.pipe(v.string(), v.uuid()) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "admissions:configure");
    await Promise.all([
      context.queryClient.ensureQueryData(lettersQuery),
      context.queryClient.ensureQueryData(templateQuery(deps.id)),
    ]);
  },
  component: LetterEditorPage,
});

const FIELD_HINT = {
  family: m.ltrFieldFamily,
  child: m.ltrFieldChild,
  grade: m.ltrFieldGrade,
  year: m.ltrFieldYear,
  school: m.ltrFieldSchool,
  reference: m.ltrFieldReference,
  expires: m.ltrFieldExpires,
} satisfies Record<(typeof LETTER_FIELDS)[number], () => string>;

/**
 * A letter of admission as the school writes it: its title and words, with
 * the fields in braces each family's letter fills in. It saves as it is
 * written, and the next letter sent uses it.
 */
function LetterEditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const template = useSuspenseQuery(templateQuery(id)).data;
  const listed = useSuspenseQuery(lettersQuery).data.find(
    (row) => row.id === id,
  );
  const version = useRef(listed?.version ?? 1);
  const media = useDocumentMedia();
  const [draft, setDraft] = useState({
    title: template.title,
    content: template.content,
  });
  const [valid, setValid] = useState(true);
  const [editorKey, setEditorKey] = useState(0);
  const arabic = listed?.builtinKey?.endsWith("_ar") ?? false;
  const { autosave, editing } = useHeldDocument({
    host: { hostType: "document_template", hostId: id },
    value: draft,
    version: () => version.current,
    latest: async () => {
      const [piece, letters] = await Promise.all([
        openTemplate({ data: { id } }),
        listTemplates({ data: { kind: "admission_letter" } }),
      ]);
      const row = letters.find((letter) => letter.id === id);
      if (!row) throw new Error("conflict.version");
      return {
        value: { title: piece.title, content: piece.content },
        version: row.version,
      };
    },
    adopt: ({ value, version: kept }) => {
      version.current = kept;
      setDraft(value);
      setEditorKey((key) => key + 1);
    },
    rebase: (kept) => {
      version.current = kept;
    },
    render: (value) => (
      <DocumentVersion
        title={value.title}
        body={value.content}
        lang={arabic ? "ar" : "en"}
      />
    ),
    text: (value) => documentText(value.title, value.content),
    save: async (value) => {
      if (!valid || !value.title.trim()) throw new Error("content.invalid");
      const saved = await updateTemplate({
        data: {
          id,
          expectedVersion: version.current,
          title: value.title.trim(),
          content: value.content,
        },
      });
      version.current = saved.version;
    },
  });
  const change = (content: ContentDocument) =>
    setDraft((current) => ({ ...current, content }));
  return (
    <>
      <DocumentPage
        heading={m.ltrEditorCrumb()}
        onBack={async () => {
          if (await autosave.flush()) {
            await queryClient.invalidateQueries({ queryKey: ["templates"] });
            void navigate({ to: "/admissions/letters" });
          }
        }}
        saveState={autosave.state}
        onRetry={autosave.retry}
        editing={editing}
        title={
          <div dir={arabic ? "rtl" : "ltr"} lang={arabic ? "ar" : "en"}>
            <DocumentTitle
              id="letter-title"
              label={m.ltrFieldTitle()}
              placeholder={m.ltrFieldTitle()}
              maxLength={120}
              value={draft.title}
              onChange={(title) =>
                setDraft((current) => ({ ...current, title }))
              }
            />
          </div>
        }
        aside={
          <DetailsPanel title={m.ltrFields()}>
            <DetailsSection title={m.ltrFieldsTitle()} hint={m.ltrFieldsHint()}>
              <dl className="grid gap-2 text-sm">
                {LETTER_FIELDS.map((field) => (
                  <div key={field} className="grid gap-0.5">
                    <dt>
                      <code dir="ltr" className="font-mono text-[13px]">
                        {`{${field}}`}
                      </code>
                    </dt>
                    <dd className="text-[13px] text-muted-foreground">
                      {FIELD_HINT[field]()}
                    </dd>
                  </div>
                ))}
              </dl>
            </DetailsSection>
          </DetailsPanel>
        }
      >
        <div dir={arabic ? "rtl" : "ltr"} lang={arabic ? "ar" : "en"}>
          <ContentEditor
            key={editorKey}
            id="letter-body"
            label={m.ltrFieldBody()}
            variant="document"
            value={draft.content}
            onChange={change}
            onValidityChange={setValid}
            media={media}
            disabled={!editing.editable}
          />
        </div>
      </DocumentPage>
      <UnsavedChangesGuard isDirty={() => autosave.dirty} pending={false} />
    </>
  );
}
