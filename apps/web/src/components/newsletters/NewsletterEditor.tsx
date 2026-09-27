import type { AudienceInput } from "@faridalms/domain/announcements";
import type { ContentDocument } from "@faridalms/domain/content";
import type {
  NewsletterContent,
  NewsletterLocale,
  NewsletterSection,
} from "@faridalms/domain/newsletters";
import type { EditorMedia } from "@faridalms/editor";

import { contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  MAX_SECTIONS,
  NEWSLETTER_LOCALES,
  sectionWritten,
  translationGaps,
} from "@faridalms/domain/newsletters";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Eye, Plus, Trash2, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import type { newsletterEditorQuery } from "~/queries/newsletters";

import {
  AudienceList,
  audienceIssue,
} from "~/components/announcements/AudienceList";
import { ContentEditor } from "~/components/content/ContentEditor";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { CheckboxRow } from "~/components/people/fields";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { newsletterOptionsQuery } from "~/queries/newsletters";
import { publishNewsletter, saveNewsletter } from "~/server/newsletters";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import {
  LOCALE_LABEL,
  LOCALE_NAME,
  NewsletterView,
  otherLocale,
} from "./NewsletterView";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof newsletterEditorQuery>["queryFn"]>>
>;

interface Translated {
  heading: string;
  body: ContentDocument;
  reviewed: boolean;
}

interface Draft {
  title: string;
  primaryLocale: NewsletterLocale;
  bilingual: boolean;
  audiences: AudienceInput[];
  sections: NewsletterSection[];
  translated: Record<string, Translated>;
  when: "now" | "later";
  sendAt: string;
}

const TEMPLATES = ["blank", "weekly", "monthly"] as const;
type Template = (typeof TEMPLATES)[number];

const TEMPLATE_LABEL: Record<Template, () => string> = {
  blank: m.nlTemplateBlank,
  weekly: m.nlTemplateWeekly,
  monthly: m.nlTemplateMonthly,
};

/** Starter headings, in the edition's language rather than the writer's. */
const TEMPLATE_HEADINGS: Record<
  Template,
  ((inputs: object, options: { locale: NewsletterLocale }) => string)[]
> = {
  blank: [],
  weekly: [m.nlStarterPrincipal, m.nlStarterWeek, m.nlStarterDates],
  monthly: [
    m.nlStarterPrincipal,
    m.nlStarterHighlights,
    m.nlStarterClasses,
    m.nlStarterDates,
  ],
};

const UNTRANSLATED: Translated = {
  heading: "",
  body: emptyContent(),
  reviewed: false,
};

const emptySection = (heading = ""): NewsletterSection => ({
  id: crypto.randomUUID(),
  heading,
  body: emptyContent(),
});

function draftOf(existing: Existing | null): Draft {
  const translated: Record<string, Translated> = {};
  const reviewed = new Set(existing?.translation?.reviewed ?? []);
  for (const section of existing?.translation?.sections ?? [])
    translated[section.id] = {
      heading: section.heading,
      body: section.body,
      reviewed: reviewed.has(section.id),
    };
  return {
    title: existing?.title ?? "",
    primaryLocale:
      existing?.primaryLocale ?? (getLocale() === "ar" ? "ar" : "en"),
    bilingual: existing?.bilingual ?? false,
    audiences: existing?.audiences.length
      ? existing.audiences.map((row) => ({
          scope: row.scope,
          classId: row.classId ?? "",
          gradeId: row.gradeId ?? "",
        }))
      : [{ scope: "families", classId: "", gradeId: "" }],
    sections: existing?.content?.sections.length
      ? existing.content.sections
      : [emptySection()],
    translated,
    when: "now",
    sendAt: "",
  };
}

function contentOf(draft: Draft): NewsletterContent {
  return { sections: draft.sections, reviewed: [] };
}

function translationOf(draft: Draft): NewsletterContent | null {
  if (!draft.bilingual) return null;
  const sections = draft.sections.flatMap((section) => {
    const match = draft.translated[section.id];
    return match && sectionWritten(match)
      ? [{ id: section.id, heading: match.heading, body: match.body }]
      : [];
  });
  return {
    sections,
    reviewed: sections
      .filter((section) => draft.translated[section.id]?.reviewed)
      .map((section) => section.id),
  };
}

const dirOf = (locale: NewsletterLocale) => getTextDirection(locale);

function SectionCard({
  section,
  index,
  count,
  locale,
  media,
  onChange,
  onMove,
  onRemove,
}: {
  section: NewsletterSection;
  index: number;
  count: number;
  locale: NewsletterLocale;
  media: EditorMedia;
  onChange: (next: NewsletterSection) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  // A new section's id is random, so the server and the browser would give
  // its fields different ids; useId agrees on both sides.
  const fieldId = useId();
  return (
    <div className="grid min-w-0 gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm leading-5 font-semibold">
          {m.nlSectionNumber({ number: formatNumber(index + 1) })}
        </h3>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="max-md:size-10"
            aria-label={m.nlMoveUp()}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="max-md:size-10"
            aria-label={m.nlMoveDown()}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="max-md:size-10"
            aria-label={m.nlRemoveSection()}
            disabled={count === 1}
            onClick={onRemove}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
      <div className="grid min-w-0 gap-4">
        <TextField
          id={`${fieldId}-heading`}
          lang={locale}
          dir="auto"
          label={m.nlHeading()}
          optional
          maxLength={200}
          autoComplete="off"
          value={section.heading}
          onChange={(event) =>
            onChange({ ...section, heading: event.target.value })
          }
        />
        <FormField id={`${fieldId}-body`} label={m.nlBody()}>
          {(control) => (
            <div className="min-w-0">
              <ContentEditor
                id={control.id}
                label={m.nlBody()}
                value={section.body}
                onChange={(body) => onChange({ ...section, body })}
                media={media}
              />
            </div>
          )}
        </FormField>
      </div>
    </div>
  );
}

function TranslationCard({
  section,
  index,
  primary,
  value,
  media,
  onChange,
}: {
  section: NewsletterSection;
  index: number;
  primary: NewsletterLocale;
  value: Translated;
  media: EditorMedia;
  onChange: (next: Translated) => void;
}) {
  const fieldId = useId();
  const locale = otherLocale(primary);
  const reference = contentPlainText(section.body).trim();
  return (
    <div className="grid min-w-0 gap-4 rounded-lg border bg-card p-4">
      <h3 className="text-sm leading-5 font-semibold">
        {m.nlSectionNumber({ number: formatNumber(index + 1) })}
      </h3>
      <div
        lang={primary}
        dir={dirOf(primary)}
        className="grid gap-1 rounded-md bg-muted/60 px-3 py-2.5 text-[13px] leading-[18px] text-muted-foreground"
      >
        {section.heading ? (
          <p className="font-medium text-foreground">{section.heading}</p>
        ) : null}
        {reference ? <p className="line-clamp-3">{reference}</p> : null}
      </div>
      <div className="grid min-w-0 gap-4">
        <TextField
          id={`${fieldId}-heading`}
          lang={locale}
          dir="auto"
          label={m.nlHeading()}
          optional
          maxLength={200}
          autoComplete="off"
          value={value.heading}
          onChange={(event) =>
            onChange({ ...value, heading: event.target.value, reviewed: false })
          }
        />
        <FormField id={`${fieldId}-body`} label={m.nlBody()}>
          {(control) => (
            <div className="min-w-0">
              <ContentEditor
                id={control.id}
                label={m.nlBody()}
                value={value.body}
                onChange={(body) =>
                  onChange({ ...value, body, reviewed: false })
                }
                media={media}
              />
            </div>
          )}
        </FormField>
      </div>
      <CheckboxRow
        label={m.nlReviewed()}
        hint={m.nlReviewedHint({ language: LOCALE_NAME[primary]() })}
        checked={value.reviewed}
        onChange={(reviewed) => onChange({ ...value, reviewed })}
      />
    </div>
  );
}

function PreviewSheet({
  open,
  onOpenChange,
  draft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: Draft;
}) {
  const [locale, setLocale] = useState<NewsletterLocale>(draft.primaryLocale);
  const side = getTextDirection(getLocale()) === "rtl" ? "left" : "right";
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        showCloseButton={false}
        className="gap-0 p-0 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[640px] data-[side=right]:sm:max-w-[640px]"
      >
        <SheetHeader className="border-b px-6 py-4 pe-14 max-md:pe-16">
          <SheetTitle className="text-base leading-6 font-semibold">
            {m.nlPreview()}
          </SheetTitle>
        </SheetHeader>
        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto bg-muted/30 px-4 py-6 sm:px-6">
          <h2
            dir="auto"
            className="text-xl leading-7 font-semibold text-balance"
          >
            {draft.title || m.nlUntitled()}
          </h2>
          <NewsletterView
            content={contentOf(draft)}
            translation={translationOf(draft)}
            primary={draft.primaryLocale}
            locale={draft.bilingual ? locale : draft.primaryLocale}
            onLocaleChange={setLocale}
          />
        </div>
        <SheetClose
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={m.commonClose()}
              className="absolute end-4 top-3 max-md:top-2 max-md:size-10"
            />
          }
        >
          <X aria-hidden />
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}

/** Title, audience, sections in one or two languages, and when it goes out. */
export function NewsletterEditor({
  existing,
  onClose,
}: {
  existing: Existing | null;
  onClose: (id?: string) => void;
}) {
  const options = useSuspenseQuery(newsletterOptionsQuery).data;
  const queryClient = useQueryClient();
  const media = useDocumentMedia();
  const [initial] = useState(() => draftOf(existing));
  const [draft, setDraft] = useState(initial);
  const [shown, setShown] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [writing, setWriting] = useState<NewsletterLocale>(
    initial.primaryLocale,
  );
  const leaving = useRef(false);
  const published = existing?.state === "published";
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setSection = (index: number, next: NewsletterSection) =>
    set(
      "sections",
      draft.sections.map((section, at) => (at === index ? next : section)),
    );
  const moveSection = (index: number, by: -1 | 1) => {
    const next = [...draft.sections];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(index + by, 0, moved);
    set("sections", next);
  };
  const applyTemplate = (template: Template) =>
    set(
      "sections",
      template === "blank"
        ? [emptySection()]
        : TEMPLATE_HEADINGS[template].map((heading) =>
            emptySection(heading({}, { locale: draft.primaryLocale })),
          ),
    );
  const save = useMutation({
    mutationFn: () =>
      saveNewsletter({
        data: {
          id: existing?.id ?? "",
          expectedVersion: existing?.version ?? 0,
          title: draft.title.trim(),
          primaryLocale: draft.primaryLocale,
          bilingual: draft.bilingual,
          audiences: draft.audiences,
          content: contentOf(draft),
          translation: translationOf(draft),
        },
      }),
  });
  const publish = useMutation({
    mutationFn: (saved: { id: string; version: number }) =>
      publishNewsletter({
        data: {
          id: saved.id,
          expectedVersion: saved.version,
          publishAt:
            draft.when === "later" && draft.sendAt
              ? new Date(draft.sendAt).toISOString()
              : "",
        },
      }),
  });
  const issues = {
    title: draft.title.trim() ? null : m.nlTitleNeeded(),
    audiences: audienceIssue(draft.audiences),
    sections: !draft.sections.some(sectionWritten)
      ? m.nlSectionsNeeded()
      : null,
    sendAt:
      draft.when === "later" && !draft.sendAt ? m.annSendAtNeeded() : null,
  };
  const gaps = draft.bilingual
    ? translationGaps(contentOf(draft), translationOf(draft))
    : { missing: [], unreviewed: [] };
  const other = otherLocale(draft.primaryLocale);
  const untouched = !existing && !draft.sections.some(sectionWritten);
  const failure = save.error ?? publish.error;
  const sectionList = (
    <div className="grid gap-4">
      {draft.sections.map((section, index) => (
        <SectionCard
          key={section.id}
          section={section}
          index={index}
          count={draft.sections.length}
          locale={draft.primaryLocale}
          media={media}
          onChange={(next) => setSection(index, next)}
          onMove={(by) => moveSection(index, by)}
          onRemove={() =>
            set(
              "sections",
              draft.sections.filter((_, at) => at !== index),
            )
          }
        />
      ))}
      {shown && issues.sections ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {issues.sections}
        </p>
      ) : null}
      {draft.sections.length < MAX_SECTIONS ? (
        <div>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() => set("sections", [...draft.sections, emptySection()])}
          >
            <Plus aria-hidden />
            {m.nlAddSection()}
          </Button>
        </div>
      ) : null}
    </div>
  );
  return (
    <>
      <RecordForm
        title={existing ? m.nlEditTitle() : m.nlNewTitle()}
        submitLabel={published ? m.nlSaveQuietly() : m.annSaveDraft()}
        secondary={
          published
            ? { label: m.nlPublishChanges(), intent: "publish" }
            : {
                label:
                  draft.when === "later" ? m.annSchedule() : m.annPublish(),
                intent: "publish",
              }
        }
        onSubmit={async (intent) => {
          setShown(true);
          if (Object.values(issues).some(Boolean)) return;
          let saved: { id: string; version: number };
          try {
            saved = await save.mutateAsync();
          } catch {
            return;
          }
          if (intent === "publish") {
            try {
              await publish.mutateAsync(saved);
            } catch {
              return;
            }
          }
          await queryClient.invalidateQueries({ queryKey: ["newsletters"] });
          leaving.current = true;
          toast.success(
            intent === "publish"
              ? published
                ? m.nlChangesPublished()
                : draft.when === "later"
                  ? m.nlScheduled()
                  : m.nlPublished()
              : m.nlSaved(),
          );
          onClose(saved.id);
        }}
        onCancel={() => onClose()}
        isDirty={() =>
          !leaving.current && JSON.stringify(draft) !== JSON.stringify(initial)
        }
        pending={save.isPending || publish.isPending}
        error={failure ? getMessageFromError(failure) : null}
      >
        <FormSection title={m.nlSectionEdition()}>
          <TextField
            id="newsletter-title"
            label={m.annColTitle()}
            width="name"
            dir="auto"
            maxLength={200}
            autoComplete="off"
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
            errors={shown && issues.title ? [issues.title] : undefined}
          />
          <SelectField
            id="newsletter-language"
            label={m.nlPrimaryLanguage()}
            hint={m.nlPrimaryLanguageHint()}
            width="name"
            value={draft.primaryLocale}
            options={NEWSLETTER_LOCALES.map((locale) => ({
              value: locale,
              label: LOCALE_LABEL[locale](),
            }))}
            onChange={(primaryLocale) => {
              setDraft((current) => ({ ...current, primaryLocale }));
              setWriting(primaryLocale);
            }}
          />
          <CheckboxRow
            label={m.nlBilingual({ language: LOCALE_NAME[other]() })}
            hint={m.nlBilingualHint({
              language: LOCALE_NAME[draft.primaryLocale](),
            })}
            checked={draft.bilingual}
            onChange={(bilingual) => {
              set("bilingual", bilingual);
              if (!bilingual) setWriting(draft.primaryLocale);
            }}
          />
        </FormSection>
        <FormSection
          title={m.annSectionAudience()}
          description={m.annAudienceHint()}
        >
          <AudienceList
            value={draft.audiences}
            onChange={(audiences) => set("audiences", audiences)}
            choices={options}
            error={shown ? issues.audiences : null}
          />
        </FormSection>
        <FormSection
          title={m.nlSectionSections()}
          description={m.nlSectionsHint()}
        >
          <div className="flex flex-wrap items-end gap-3">
            {untouched ? (
              <SelectField
                id="newsletter-template"
                label={m.nlStartFrom()}
                width="name"
                value="blank"
                options={TEMPLATES.map((template) => ({
                  value: template,
                  label: TEMPLATE_LABEL[template](),
                }))}
                onChange={applyTemplate}
              />
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              onClick={() => setPreviewing(true)}
            >
              <Eye aria-hidden />
              {m.nlPreview()}
            </Button>
          </div>
          {draft.bilingual ? (
            <Tabs
              value={writing}
              onValueChange={(value: NewsletterLocale) => setWriting(value)}
              className="grid gap-4"
            >
              <TabsList aria-label={m.nlLanguage()}>
                {[draft.primaryLocale, other].map((locale) => (
                  <TabsTrigger key={locale} value={locale} lang={locale}>
                    {LOCALE_LABEL[locale]()}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value={draft.primaryLocale}>
                {sectionList}
              </TabsContent>
              <TabsContent value={other}>
                <div className="grid gap-4">
                  {draft.sections.map((section, index) => (
                    <TranslationCard
                      key={section.id}
                      section={section}
                      index={index}
                      primary={draft.primaryLocale}
                      value={draft.translated[section.id] ?? UNTRANSLATED}
                      media={media}
                      onChange={(next) =>
                        set("translated", {
                          ...draft.translated,
                          [section.id]: next,
                        })
                      }
                    />
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            sectionList
          )}
        </FormSection>
        <FormSection title={m.annSectionDelivery()}>
          {draft.bilingual &&
          (gaps.missing.length > 0 || gaps.unreviewed.length > 0) ? (
            <div className="grid gap-1 rounded-lg border border-warning/60 bg-warning/10 px-4 py-3 text-sm leading-5">
              {gaps.missing.length > 0 ? (
                <p>
                  {m.nlMissingTranslation({
                    count: gaps.missing.length,
                    value: formatNumber(gaps.missing.length),
                    language: LOCALE_NAME[other](),
                    primary: LOCALE_NAME[draft.primaryLocale](),
                  })}
                </p>
              ) : null}
              {gaps.unreviewed.length > 0 ? (
                <p>
                  {m.nlUnreviewed({
                    count: gaps.unreviewed.length,
                    value: formatNumber(gaps.unreviewed.length),
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
          {published ? (
            <p className="text-sm leading-5 text-muted-foreground">
              {m.nlPublishedHint()}
            </p>
          ) : (
            <>
              <SelectField
                id="newsletter-when"
                label={m.annWhen()}
                width="name"
                value={draft.when}
                options={[
                  { value: "now", label: m.annWhenNow() },
                  { value: "later", label: m.annWhenLater() },
                ]}
                onChange={(when) => set("when", when)}
              />
              {draft.when === "later" ? (
                <FormField
                  id="newsletter-send-at"
                  label={m.annSendAt()}
                  errors={shown && issues.sendAt ? [issues.sendAt] : undefined}
                >
                  {(control) => (
                    <Input
                      {...control}
                      type="datetime-local"
                      className="w-60 max-md:h-10"
                      value={draft.sendAt}
                      onChange={(event) => set("sendAt", event.target.value)}
                    />
                  )}
                </FormField>
              ) : null}
            </>
          )}
        </FormSection>
      </RecordForm>
      {previewing ? (
        <PreviewSheet open onOpenChange={setPreviewing} draft={draft} />
      ) : null}
    </>
  );
}
