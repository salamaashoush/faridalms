import type { FileSummary } from "@faridalms/database/repositories/files";
import type { ContentDocument } from "@faridalms/domain/content";
import type { SaveSitePostInput } from "@faridalms/domain/site";

import { contentDocumentSchema } from "@faridalms/domain/content";
import {
  SITE_LOCALES,
  SITE_MEDIA_BYTES,
  saveSitePostSchema,
} from "@faridalms/domain/site";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, History, Send, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { ManagementInput } from "~/components/admin/ManagementDialog";
import { ManagementPage } from "~/components/admin/ManagementPage";
import { FileUploader } from "~/components/assignments/FileUploader";
import { ContentEditor } from "~/components/content/ContentEditor";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Field, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import * as m from "~/i18n/messages";
import { sitePostRevisionsQuery } from "~/queries/site";
import {
  getSitePostRevision,
  publishSitePost,
  saveSitePost,
  unpublishSitePost,
} from "~/server/site";
import { formatDateTime } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { PostStateBadge } from "./SitePostsPanel";

const NONE = "none";

export function SitePostWorkspace({
  initial,
  cover,
  status,
  publishAt,
  categories,
  onSaved,
  onClose,
}: {
  initial: SaveSitePostInput;
  cover: FileSummary | null;
  status: "draft" | "published";
  publishAt: Date | null;
  categories: { id: string; name: string }[];
  onSaved: (id: string) => void;
  onClose: () => void;
}) {
  // The database hands back jsonb in its own key order, while the editor and
  // the save schema emit schema order, so both sides are normalised before the
  // unsaved-change comparison ever sees them.
  const [baseline, setBaseline] = useState(() => ({
    ...initial,
    document: v.parse(contentDocumentSchema, initial.document),
  }));
  const [state, setState] = useState({ status, publishAt });
  const [document, setDocument] = useState<ContentDocument>(
    () => baseline.document,
  );
  const [editorKey, setEditorKey] = useState(0);
  const [valid, setValid] = useState(true);
  const [coverFiles, setCoverFiles] = useState<FileSummary[]>(
    cover ? [cover] : [],
  );
  const [schedule, setSchedule] = useState("");
  const queryClient = useQueryClient();
  const save = useServerFn(saveSitePost);
  const publish = useServerFn(publishSitePost);
  const unpublish = useServerFn(unpublishSitePost);
  const loadRevision = useServerFn(getSitePostRevision);
  const leaving = useRef(false);
  const revisions = useQuery({
    ...sitePostRevisionsQuery(baseline.id),
    enabled: baseline.expectedRevision > 0,
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["site"] });
    await queryClient.invalidateQueries({ queryKey: ["public-site"] });
  };
  const publication = useMutation({
    mutationFn: async (kind: "publish" | "schedule" | "unpublish") => {
      const revision = {
        id: baseline.id,
        expectedRevision: baseline.expectedRevision,
      };
      if (kind === "unpublish")
        return { kind, saved: await unpublish({ data: revision }) };
      const when = kind === "schedule" ? new Date(schedule) : null;
      if (kind === "schedule" && (!schedule || Number.isNaN(when?.getTime())))
        throw new Error("site.schedule_required");
      return {
        kind,
        saved: await publish({
          data: { ...revision, publishAt: when ? when.toISOString() : null },
        }),
      };
    },
    onSuccess: async ({ kind, saved }) => {
      setBaseline((current) => ({
        ...current,
        expectedRevision: saved.revision,
      }));
      setState(
        kind === "unpublish"
          ? { status: "draft", publishAt: null }
          : {
              status: "published",
              publishAt: "publishAt" in saved ? saved.publishAt : null,
            },
      );
      await refresh();
      toast.success(
        kind === "unpublish"
          ? m.siteUnpublishedToast()
          : kind === "schedule"
            ? m.siteScheduledToast()
            : m.sitePublishedToast(),
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof Error && error.message === "site.schedule_required"
          ? m.siteScheduleRequired()
          : getMessageFromError(error),
      ),
  });
  const mutation = useMutation({
    mutationFn: (data: SaveSitePostInput) => save({ data }),
  });
  const form = useForm({
    defaultValues: {
      title: baseline.title,
      slug: baseline.slug,
      summary: baseline.summary,
      locale: baseline.locale,
      categoryId: baseline.categoryId ?? NONE,
    },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: v.object({
        title: saveSitePostSchema.entries.title,
        slug: saveSitePostSchema.entries.slug,
        summary: saveSitePostSchema.entries.summary,
        locale: saveSitePostSchema.entries.locale,
        categoryId: v.string(),
      }),
    },
    onSubmit: async ({ value }) => {
      if (!valid) throw new Error("content.invalid");
      const input = v.parse(saveSitePostSchema, {
        ...baseline,
        ...value,
        categoryId: value.categoryId === NONE ? null : value.categoryId,
        coverFileId: coverFiles[0]?.id ?? null,
        document,
      });
      const saved = await mutation.mutateAsync(input);
      setBaseline({ ...input, expectedRevision: saved.revision });
      setDocument(input.document);
      form.reset(value);
      await refresh();
      toast.success(m.managementSaved());
      onSaved(saved.id);
    },
  });
  const dirty = () =>
    form.state.values.title !== baseline.title ||
    form.state.values.slug !== baseline.slug ||
    form.state.values.summary !== baseline.summary ||
    form.state.values.locale !== baseline.locale ||
    (form.state.values.categoryId === NONE
      ? null
      : form.state.values.categoryId) !== baseline.categoryId ||
    (coverFiles[0]?.id ?? null) !== baseline.coverFileId ||
    JSON.stringify(document) !== JSON.stringify(baseline.document);
  const busy = mutation.isPending || publication.isPending;
  const restore = async (revision: number) => {
    const row = await loadRevision({ data: { id: baseline.id, revision } });
    form.setFieldValue("title", row.title);
    form.setFieldValue("summary", row.summary);
    setDocument(row.document);
    setEditorKey((key) => key + 1);
    toast.success(m.siteRevisionRestored({ revision: String(revision) }));
  };
  const categoryItems = [
    { value: NONE, label: m.siteNoCategory() },
    ...categories.map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ];
  return (
    <ManagementPage
      title={m.sitePostWrite()}
      description={m.sitePostEditorHint()}
      pending={mutation.isPending}
      onClose={() => {
        leaving.current = true;
        onClose();
      }}
      onSubmit={() => form.handleSubmit()}
      headerActions={<PostStateBadge post={state} />}
      actions={
        baseline.expectedRevision > 0 ? (
          state.status === "published" ? (
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
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="datetime-local"
                aria-label={m.sitePublishAt()}
                value={schedule}
                onChange={(event) => setSchedule(event.target.value)}
                className="h-10 w-auto"
                disabled={busy}
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy || dirty() || !schedule}
                onClick={() => publication.mutate("schedule")}
              >
                <CalendarClock className="size-4" aria-hidden />
                {m.siteSchedule()}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || dirty()}
                onClick={() => publication.mutate("publish")}
              >
                <Send className="size-4" aria-hidden />
                {m.sitePublishNow()}
              </Button>
            </div>
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
              label={m.sitePostTitle()}
              value={field.state.value}
              maxLength={200}
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
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              errors={field.state.meta.errors}
            />
          )}
        </form.Field>
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
        <form.Field name="categoryId">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="site-post-category">
                {m.siteCategory()}
              </FieldLabel>
              <Select
                items={categoryItems}
                value={field.state.value}
                onValueChange={(next) => field.handleChange(next ?? NONE)}
              >
                <SelectTrigger
                  id="site-post-category"
                  className="h-11 w-full sm:h-10"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        <div className="sm:col-span-2">
          <FileUploader
            label={m.siteCover()}
            description={m.siteCoverHint()}
            purpose="site_media"
            value={coverFiles}
            onChange={(update) =>
              setCoverFiles((current) => update(current).slice(-1))
            }
            maxFiles={1}
            maxBytes={SITE_MEDIA_BYTES}
            disabled={busy}
          />
        </div>
      </section>
      <ContentEditor
        key={editorKey}
        id="site-post-body"
        label={m.sitePostBody()}
        value={document}
        onChange={setDocument}
        onValidityChange={setValid}
        disabled={mutation.isPending}
      />
      {revisions.data && revisions.data.length > 0 ? (
        <section className="rounded-xl border bg-card p-5 sm:p-7">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4" aria-hidden />
            {m.siteRevisions()}
          </h2>
          <ul className="mt-3 divide-y">
            {revisions.data.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm"
              >
                <Badge variant="outline">{row.revision}</Badge>
                <span className="min-w-0 flex-1 truncate">{row.title}</span>
                <span className="text-xs text-muted-foreground">
                  {m.siteRevisionBy({
                    name: row.savedBy?.name ?? "",
                    date: formatDateTime(row.createdAt.toISOString()),
                  })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy || row.revision === baseline.expectedRevision}
                  onClick={() => void restore(row.revision)}
                >
                  {m.siteRevisionRestore()}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {mutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getMessageFromError(mutation.error)}
        </p>
      ) : null}
    </ManagementPage>
  );
}
