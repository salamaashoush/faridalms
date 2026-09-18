import type { SaveNewsletterDraftInput } from "@faridalms/domain/newsletter";

import { saveNewsletterDraftSchema } from "@faridalms/domain/newsletter";
import { useForm, revalidateLogic } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Send } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { ManagementInput } from "~/components/admin/ManagementDialog";
import { ManagementPage } from "~/components/admin/ManagementPage";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { saveNewsletterDraft } from "~/server/newsletter-drafts";
import { publishNewsletterDraft } from "~/server/notifications";
import { getMessageFromError } from "~/utils/error";

import { NewsletterDesigner } from "./NewsletterDesigner";
import { NewsletterDocument } from "./NewsletterDocument";

export function NewsletterWorkspace({
  initial,
  yearName,
  onSaved,
  onClose,
}: {
  initial: SaveNewsletterDraftInput;
  yearName: string;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const [baseline, setBaseline] = useState(initial);
  const [document, setDocument] = useState(initial.document);
  const [invalidBlocks, setInvalidBlocks] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const publish = useServerFn(publishNewsletterDraft);
  const leaving = useRef(false);
  const publication = useMutation({
    mutationFn: () =>
      publish({
        data: {
          id: baseline.id,
          expectedRevision: baseline.expectedRevision,
          publishedOn: new Date().toISOString().slice(0, 10),
        },
      }),
    onSuccess: async (edition) => {
      await queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      await queryClient.invalidateQueries({ queryKey: ["newsletter-drafts"] });
      toast.success(m.newsletterPublishedToast());
      leaving.current = true;
      void navigate({
        to: "/newsletters/$newsletterId",
        params: { newsletterId: edition.id },
      });
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const mutation = useMutation({
    mutationFn: (data: SaveNewsletterDraftInput) =>
      saveNewsletterDraft({ data }),
  });
  const form = useForm({
    defaultValues: {
      title: baseline.title,
      summary: baseline.summary,
      locale: baseline.document.locale,
    },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: v.object({
        title: saveNewsletterDraftSchema.entries.title,
        summary: saveNewsletterDraftSchema.entries.summary,
        locale: v.picklist(["en", "ar"]),
      }),
    },
    onSubmit: async ({ value }) => {
      if (invalidBlocks.size) throw new Error("content.invalid");
      const input = v.parse(saveNewsletterDraftSchema, {
        ...baseline,
        title: value.title,
        summary: value.summary,
        document: { ...document, locale: value.locale },
      });
      const saved = await mutation.mutateAsync(input);
      const next = { ...input, expectedRevision: saved.revision };
      setBaseline(next);
      form.reset(value);
      setDocument(next.document);
      await queryClient.invalidateQueries({ queryKey: ["newsletter-drafts"] });
      toast.success(m.managementSaved());
      onSaved(saved.id);
    },
  });
  return (
    <ManagementPage
      title={m.newsletterDesignTitle()}
      description={m.newsletterDesignHint({ year: yearName })}
      pending={mutation.isPending}
      onClose={onClose}
      onSubmit={() => form.handleSubmit()}
      actions={
        baseline.expectedRevision > 0 ? (
          <Button
            type="button"
            variant="secondary"
            disabled={mutation.isPending || publication.isPending}
            onClick={() => publication.mutate()}
          >
            <Send className="size-4" aria-hidden />
            {m.newsletterPublishEdition()}
          </Button>
        ) : undefined
      }
      isDirty={() =>
        !leaving.current &&
        (invalidBlocks.size > 0 ||
          form.state.values.title !== baseline.title ||
          form.state.values.summary !== baseline.summary ||
          form.state.values.locale !== baseline.document.locale ||
          JSON.stringify(document) !== JSON.stringify(baseline.document))
      }
      sectioned
    >
      <section className="grid gap-5 rounded-xl border bg-card p-5 sm:p-7">
        <form.Field name="title">
          {(field) => (
            <ManagementInput
              label={m.newslettersTitle()}
              value={field.state.value}
              maxLength={255}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        <form.Field name="summary">
          {(field) => (
            <ManagementInput
              label={m.newsletterSummary()}
              value={field.state.value}
              maxLength={10000}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        <form.Field name="locale">
          {(field) => (
            <fieldset
              aria-label={m.newsletterLanguage()}
              className="flex items-center gap-2"
            >
              <span className="me-auto text-sm font-medium">
                {m.newsletterLanguage()}
              </span>
              {(["en", "ar"] as const).map((locale) => (
                <Button
                  key={locale}
                  type="button"
                  variant={
                    field.state.value === locale ? "secondary" : "outline"
                  }
                  aria-pressed={field.state.value === locale}
                  onClick={() => field.handleChange(locale)}
                >
                  {locale === "en"
                    ? m.newsletterEnglish()
                    : m.newsletterArabic()}
                </Button>
              ))}
            </fieldset>
          )}
        </form.Field>
      </section>
      <fieldset aria-label={m.newsletterView()} className="flex gap-2">
        <Button
          type="button"
          variant={!preview ? "secondary" : "outline"}
          aria-pressed={!preview}
          onClick={() => setPreview(false)}
        >
          {m.markdownWrite()}
        </Button>
        <Button
          type="button"
          variant={preview ? "secondary" : "outline"}
          aria-pressed={preview}
          disabled={invalidBlocks.size > 0}
          onClick={() => setPreview(true)}
        >
          {m.markdownPreview()}
        </Button>
      </fieldset>
      <div hidden={preview}>
        <NewsletterDesigner
          document={document}
          onChange={setDocument}
          disabled={mutation.isPending}
          onValidityChange={(id, valid) =>
            setInvalidBlocks((current) => {
              const next = new Set(current);
              if (valid) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        />
      </div>
      {preview ? (
        <form.Subscribe selector={(state) => state.values}>
          {(value) => (
            <NewsletterDocument
              document={{ ...document, locale: value.locale }}
              title={value.title}
              summary={value.summary}
            />
          )}
        </form.Subscribe>
      ) : null}
    </ManagementPage>
  );
}
