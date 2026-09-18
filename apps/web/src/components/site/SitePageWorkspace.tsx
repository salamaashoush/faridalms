import type {
  SaveSitePageInput,
  SitePublicationStatus,
} from "@faridalms/domain/site";

import { SITE_LOCALES, saveSitePageSchema } from "@faridalms/domain/site";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Send, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { ManagementInput } from "~/components/admin/ManagementDialog";
import { ManagementPage } from "~/components/admin/ManagementPage";
import { NewsletterDesigner } from "~/components/communication/NewsletterDesigner";
import { NewsletterDocument } from "~/components/communication/NewsletterDocument";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "~/components/ui/field";
import * as m from "~/i18n/messages";
import {
  publishSitePage,
  saveSitePage,
  unpublishSitePage,
} from "~/server/site";
import { getMessageFromError } from "~/utils/error";

import { siteMediaUrl } from "./SiteShell";

export function SitePageWorkspace({
  initial,
  status,
  school,
  onSaved,
  onClose,
}: {
  initial: SaveSitePageInput;
  status: SitePublicationStatus;
  school: string;
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  const [baseline, setBaseline] = useState(initial);
  const [state, setState] = useState(status);
  const [document, setDocument] = useState(initial.document);
  const [invalidBlocks, setInvalidBlocks] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState(false);
  const queryClient = useQueryClient();
  const save = useServerFn(saveSitePage);
  const publish = useServerFn(publishSitePage);
  const unpublish = useServerFn(unpublishSitePage);
  const leaving = useRef(false);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["site"] });
    await queryClient.invalidateQueries({ queryKey: ["public-site"] });
  };
  const publication = useMutation({
    mutationFn: (kind: "publish" | "unpublish") =>
      (kind === "publish" ? publish : unpublish)({
        data: { id: baseline.id, expectedRevision: baseline.expectedRevision },
      }),
    onSuccess: async (saved, kind) => {
      setBaseline((current) => ({
        ...current,
        expectedRevision: saved.revision,
      }));
      setState(kind === "publish" ? "published" : "draft");
      await refresh();
      toast.success(
        kind === "publish" ? m.sitePublishedToast() : m.siteUnpublishedToast(),
      );
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const mutation = useMutation({
    mutationFn: (data: SaveSitePageInput) => save({ data }),
  });
  const form = useForm({
    defaultValues: {
      title: baseline.title,
      slug: baseline.slug,
      summary: baseline.summary,
      locale: baseline.locale,
      navGroup: baseline.navGroup,
      navOrder: baseline.navOrder,
      showInNav: baseline.showInNav,
    },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: v.object({
        title: saveSitePageSchema.entries.title,
        slug: saveSitePageSchema.entries.slug,
        summary: saveSitePageSchema.entries.summary,
        locale: saveSitePageSchema.entries.locale,
        navGroup: saveSitePageSchema.entries.navGroup,
        navOrder: saveSitePageSchema.entries.navOrder,
        showInNav: saveSitePageSchema.entries.showInNav,
      }),
    },
    onSubmit: async ({ value }) => {
      if (invalidBlocks.size) throw new Error("content.invalid");
      const input = v.parse(saveSitePageSchema, {
        ...baseline,
        ...value,
        document: { ...document, locale: value.locale },
      });
      const saved = await mutation.mutateAsync(input);
      const next = { ...input, expectedRevision: saved.revision };
      setBaseline(next);
      form.reset(value);
      setDocument(next.document);
      await refresh();
      toast.success(m.managementSaved());
      onSaved(saved.id);
    },
  });
  const dirty = () =>
    invalidBlocks.size > 0 ||
    form.state.values.title !== baseline.title ||
    form.state.values.slug !== baseline.slug ||
    form.state.values.summary !== baseline.summary ||
    form.state.values.locale !== baseline.locale ||
    form.state.values.navGroup !== baseline.navGroup ||
    form.state.values.navOrder !== baseline.navOrder ||
    form.state.values.showInNav !== baseline.showInNav ||
    JSON.stringify(document) !== JSON.stringify(baseline.document);
  const busy = mutation.isPending || publication.isPending;
  return (
    <ManagementPage
      title={m.sitePageDesign()}
      description={m.sitePageEditorHint()}
      pending={mutation.isPending}
      onClose={() => {
        leaving.current = true;
        onClose();
      }}
      onSubmit={() => form.handleSubmit()}
      headerActions={
        <Badge variant={state === "published" ? "default" : "outline"}>
          {state === "published"
            ? m.siteStatusPublished()
            : m.siteStatusDraft()}
        </Badge>
      }
      actions={
        baseline.expectedRevision > 0 ? (
          state === "published" ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => publication.mutate("unpublish")}
            >
              <Undo2 className="size-4" aria-hidden />
              {m.siteUnpublish()}
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={busy || dirty()}
              onClick={() => publication.mutate("publish")}
            >
              <Send className="size-4" aria-hidden />
              {m.sitePublish()}
            </Button>
          )
        ) : undefined
      }
      isDirty={() => !leaving.current && dirty()}
      sectioned
    >
      <section className="grid gap-5 rounded-xl border bg-card p-5 sm:grid-cols-2 sm:p-7">
        <form.Field name="title">
          {(field) => (
            <ManagementInput
              label={m.sitePageTitle()}
              value={field.state.value}
              maxLength={160}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        <form.Field name="slug">
          {(field) => (
            <ManagementInput
              label={m.siteSlug()}
              dir="ltr"
              value={field.state.value}
              maxLength={80}
              aria-describedby="site-page-slug-hint"
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        <p
          id="site-page-slug-hint"
          className="text-xs text-muted-foreground sm:col-span-2"
        >
          {m.siteSlugHint()}
        </p>
        <div className="sm:col-span-2">
          <form.Field name="summary">
            {(field) => (
              <ManagementInput
                label={m.siteSummary()}
                value={field.state.value}
                maxLength={500}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>
        </div>
        <form.Field name="navGroup">
          {(field) => (
            <ManagementInput
              label={m.siteNavGroup()}
              value={field.state.value}
              maxLength={60}
              aria-describedby="site-nav-group-hint"
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        <form.Field name="navOrder">
          {(field) => (
            <ManagementInput
              label={m.siteNavOrder()}
              type="number"
              min={0}
              max={999}
              value={String(field.state.value)}
              onChange={(event) =>
                field.handleChange(Number(event.target.value))
              }
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
        <p
          id="site-nav-group-hint"
          className="text-xs text-muted-foreground sm:col-span-2"
        >
          {m.siteNavGroupHint()}
        </p>
        <form.Field name="showInNav">
          {(field) => (
            <Field orientation="horizontal">
              <Checkbox
                id="site-show-in-nav"
                checked={field.state.value}
                onCheckedChange={(next) => field.handleChange(next)}
              />
              <FieldContent>
                <FieldLabel htmlFor="site-show-in-nav">
                  {m.siteShowInNav()}
                </FieldLabel>
                <FieldDescription>{m.siteShowInNavHint()}</FieldDescription>
              </FieldContent>
            </Field>
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
              {SITE_LOCALES.map((locale) => (
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
        <form.Subscribe selector={(formState) => formState.values}>
          {(values) => (
            <NewsletterDocument
              document={{ ...document, locale: values.locale }}
              title={values.title}
              summary={values.summary}
              assetUrl={siteMediaUrl(school)}
            />
          )}
        </form.Subscribe>
      ) : null}
      {mutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getMessageFromError(mutation.error)}
        </p>
      ) : null}
    </ManagementPage>
  );
}
