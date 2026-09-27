import type {
  PageContent,
  PageSection,
  SectionType,
  SiteIssue,
  SiteLocale,
} from "@faridalms/domain/website";

import {
  localizedSections,
  newSection,
  overlay,
  pageIssues,
  SECTION_TYPES,
  sectionComplete,
  sectionWritten,
  wordless,
} from "@faridalms/domain/website";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Eye, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { siteOverviewQuery, sitePageQuery } from "~/queries/site";

import { CheckboxRow } from "~/components/people/fields";
import { SelectField, TextField } from "~/components/system/field";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import { StatusBadge } from "~/components/system/status";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import * as m from "~/i18n/messages";
import { publishSitePage, saveSitePage } from "~/server/site";
import { getMessageFromError } from "~/utils/error";

import type { Languages } from "./SectionFields";

import {
  ISSUE_LABEL,
  LOCALE_NAME,
  SECTION_ICON,
  SECTION_LABEL,
} from "./format";
import { History } from "./History";
import { Preview } from "./Preview";
import { SectionFields } from "./SectionFields";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof sitePageQuery>["queryFn"]>>
>;
type Overview = Awaited<
  ReturnType<NonNullable<(typeof siteOverviewQuery)["queryFn"]>>
>;

interface Draft {
  titleEn: string;
  titleAr: string;
  slug: string;
  parentId: string;
  inMenu: boolean;
  sections: PageSection[];
  /** The other language's words, by section. */
  translated: Record<string, PageSection>;
  reviewed: string[];
  when: "now" | "later";
  publishAt: string;
}

const slugOf = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

function draftOf(existing: Existing | null): Draft {
  const translated: Record<string, PageSection> = {};
  for (const section of existing?.translation?.sections ?? [])
    translated[section.id] = section;
  return {
    titleEn: existing?.titleEn ?? "",
    titleAr: existing?.titleAr ?? "",
    slug: existing?.slug ?? "",
    parentId: existing?.parentId ?? "",
    inMenu: existing?.inMenu ?? true,
    sections: existing?.content.sections ?? [],
    translated,
    reviewed: existing?.translation?.reviewed ?? [],
    when: "now",
    publishAt: "",
  };
}

/** The other language of a section, always in the section's current shape. */
const otherOf = (draft: Draft, section: PageSection) =>
  overlay(section, draft.translated[section.id] ?? wordless(section));

function contentOf(draft: Draft): {
  content: PageContent;
  translation: PageContent;
} {
  const sections = draft.sections
    .map((section) => otherOf(draft, section))
    .filter(sectionWritten);
  const kept = new Set(sections.map((section) => section.id));
  return {
    content: { sections: draft.sections, reviewed: [] },
    translation: {
      sections,
      reviewed: draft.reviewed.filter((sectionId) => kept.has(sectionId)),
    },
  };
}

function issuesOf(
  draft: Draft,
  languages: Languages,
): { locale: SiteLocale; issue: SiteIssue }[] {
  const { content, translation } = contentOf(draft);
  const locales = languages.other
    ? [languages.primary, languages.other]
    : [languages.primary];
  return locales.flatMap((locale) =>
    pageIssues(
      localizedSections(
        content,
        languages.other ? translation : null,
        languages.primary,
        locale,
      )
        .filter((entry) => entry.locale === locale)
        .map((entry) => entry.section),
    ).map((issue) => ({ locale, issue })),
  );
}

/**
 * A website page: its title and address, then its sections, each with its
 * words in every language the site speaks. Problems that would stop it going
 * out show beside the section they are in.
 */
export function PageEditor({
  existing,
  overview,
  onClose,
}: {
  existing: Existing | null;
  overview: Overview;
  onClose: (id?: string) => void;
}) {
  const queryClient = useQueryClient();
  const settings = overview.settings;
  const languages: Languages = {
    primary: settings.primaryLocale,
    other: settings.bilingual
      ? settings.primaryLocale === "en"
        ? "ar"
        : "en"
      : null,
  };
  const [initial] = useState(() => draftOf(existing));
  const [draft, setDraft] = useState(initial);
  const [shown, setShown] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const leaving = useRef(false);
  const slugTouched = useRef(Boolean(existing));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setSection = (next: PageSection) =>
    set(
      "sections",
      draft.sections.map((section) =>
        section.id === next.id ? next : section,
      ),
    );
  const setOther = (next: PageSection) =>
    setDraft((current) => ({
      ...current,
      translated: { ...current.translated, [next.id]: next },
    }));
  const moveSection = (index: number, by: -1 | 1) => {
    const next = [...draft.sections];
    const [section] = next.splice(index, 1);
    if (!section) return;
    next.splice(index + by, 0, section);
    set("sections", next);
  };
  const primaryTitle =
    languages.primary === "ar" ? draft.titleAr : draft.titleEn;
  const problems = issuesOf(draft, languages);
  const validity = {
    title: primaryTitle.trim() ? null : m.siteTitleNeeded(),
    slug: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(draft.slug)
      ? null
      : m.siteSlugNeeded(),
    publishAt:
      draft.when === "later" && !draft.publishAt ? m.siteWhenNeeded() : null,
  };
  const save = useMutation({
    mutationFn: () => {
      const { content, translation } = contentOf(draft);
      return saveSitePage({
        data: {
          id: existing?.id ?? "",
          expectedVersion: existing?.version ?? 0,
          parentId: draft.parentId,
          slug: draft.slug,
          titleEn: draft.titleEn.trim(),
          titleAr: draft.titleAr.trim(),
          inMenu: draft.inMenu,
          content,
          translation: languages.other ? translation : null,
        },
      });
    },
  });
  const publish = useMutation({
    mutationFn: (saved: { id: string; version: number }) =>
      publishSitePage({
        data: {
          id: saved.id,
          expectedVersion: saved.version,
          publishAt:
            draft.when === "later" && draft.publishAt
              ? new Date(draft.publishAt).toISOString()
              : "",
        },
      }),
  });
  const published = existing?.state === "published";
  const parents = existing
    ? existing.parents
    : overview.pages
        .filter((page) => !page.isHome)
        .map((page) => ({
          id: page.id,
          title:
            (languages.primary === "ar" ? page.titleAr : page.titleEn) ||
            page.titleEn ||
            page.titleAr,
        }));
  const failure = save.error ?? publish.error;
  const add = (type: SectionType) =>
    set("sections", [...draft.sections, newSection(type)]);
  return (
    <>
      <RecordForm
        title={existing ? m.siteEditPage() : m.siteNewPage()}
        submitLabel={published ? m.siteSaveQuietly() : m.siteSaveDraft()}
        secondary={{
          label: published
            ? m.sitePublishChanges()
            : draft.when === "later"
              ? m.siteSchedule()
              : m.sitePublish(),
          intent: "publish",
        }}
        onSubmit={async (intent) => {
          setShown(true);
          if (Object.values(validity).some(Boolean)) return;
          if (intent === "publish" && problems.length > 0) {
            toast.error(m.siteFixIssues());
            return;
          }
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
          await queryClient.invalidateQueries({ queryKey: ["site"] });
          leaving.current = true;
          toast.success(
            intent === "publish"
              ? draft.when === "later"
                ? m.siteScheduled()
                : m.sitePublished()
              : m.siteSaved(),
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
        <FormSection title={m.sitePageDetails()}>
          <TextField
            id="page-title-en"
            label={m.siteTitleEn()}
            width="name"
            dir="ltr"
            lang="en"
            maxLength={200}
            optional={languages.primary !== "en"}
            value={draft.titleEn}
            onChange={(event) => {
              const titleEn = event.target.value;
              setDraft((current) => ({
                ...current,
                titleEn,
                slug: slugTouched.current ? current.slug : slugOf(titleEn),
              }));
            }}
            errors={
              shown && languages.primary === "en" && validity.title
                ? [validity.title]
                : undefined
            }
          />
          <TextField
            id="page-title-ar"
            label={m.siteTitleAr()}
            width="name"
            dir="rtl"
            lang="ar"
            maxLength={200}
            optional={languages.primary !== "ar"}
            value={draft.titleAr}
            onChange={(event) => set("titleAr", event.target.value)}
            errors={
              shown && languages.primary === "ar" && validity.title
                ? [validity.title]
                : undefined
            }
          />
          <TextField
            id="page-slug"
            label={m.siteSlug()}
            hint={m.sitePageSlugHint({ slug: draft.slug || "…" })}
            width="name"
            dir="ltr"
            maxLength={80}
            autoComplete="off"
            value={draft.slug}
            onChange={(event) => {
              slugTouched.current = true;
              set("slug", event.target.value.toLowerCase());
            }}
            errors={shown && validity.slug ? [validity.slug] : undefined}
          />
          {existing?.isHome ? null : (
            <SelectField
              id="page-parent"
              label={m.siteParent()}
              hint={m.siteParentHint()}
              width="name"
              value={draft.parentId}
              options={[
                { value: "", label: m.siteNoParent() },
                ...parents.map((page) => ({
                  value: page.id,
                  label: page.title,
                })),
              ]}
              onChange={(parentId) => set("parentId", parentId)}
            />
          )}
          <CheckboxRow
            label={m.siteShowInMenu()}
            hint={m.siteShowInMenuHint()}
            checked={draft.inMenu}
            onChange={(inMenu) => set("inMenu", inMenu)}
          />
        </FormSection>
        <FormSection
          title={m.siteSections()}
          description={
            languages.other
              ? m.siteSectionsBilingualHint({
                  language: LOCALE_NAME[languages.other](),
                })
              : m.siteSectionsHint()
          }
        >
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              onClick={() => setPreviewing(true)}
            >
              <Eye aria-hidden />
              {m.sitePreview()}
            </Button>
          </div>
          <div className="grid gap-4">
            {draft.sections.map((section, index) => {
              const Icon = SECTION_ICON[section.type];
              const other = otherOf(draft, section);
              const missing =
                languages.other &&
                sectionWritten(section) &&
                !sectionComplete(section, other);
              const found = problems.filter(
                (entry) => entry.issue.sectionId === section.id,
              );
              return (
                <section
                  key={section.id}
                  aria-labelledby={`section-${section.id}-label`}
                  className="grid min-w-0 gap-4 rounded-lg border bg-card p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3
                      id={`section-${section.id}-label`}
                      className="inline-flex items-center gap-2 text-sm leading-5 font-semibold"
                    >
                      <Icon
                        aria-hidden
                        className="size-4 text-muted-foreground"
                      />
                      {SECTION_LABEL[section.type]()}
                      {missing && languages.other ? (
                        <StatusBadge tone="warning">
                          {m.siteMissingTranslation({
                            language: LOCALE_NAME[languages.other](),
                          })}
                        </StatusBadge>
                      ) : null}
                    </h3>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="max-md:size-10"
                        aria-label={m.siteMoveSectionUp()}
                        disabled={index === 0}
                        onClick={() => moveSection(index, -1)}
                      >
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="max-md:size-10"
                        aria-label={m.siteMoveSectionDown()}
                        disabled={index === draft.sections.length - 1}
                        onClick={() => moveSection(index, 1)}
                      >
                        <ArrowDown aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="max-md:size-10"
                        aria-label={m.siteRemoveSection()}
                        onClick={() =>
                          set(
                            "sections",
                            draft.sections.filter(
                              (entry) => entry.id !== section.id,
                            ),
                          )
                        }
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <SectionFields
                    section={section}
                    other={other}
                    languages={languages}
                    onChange={setSection}
                    onOther={setOther}
                  />
                  {languages.other && sectionWritten(other) ? (
                    <CheckboxRow
                      label={m.siteReviewed({
                        language: LOCALE_NAME[languages.other](),
                      })}
                      hint={m.siteReviewedHint()}
                      checked={draft.reviewed.includes(section.id)}
                      onChange={(checked) =>
                        set(
                          "reviewed",
                          checked
                            ? [...draft.reviewed, section.id]
                            : draft.reviewed.filter(
                                (sectionId) => sectionId !== section.id,
                              ),
                        )
                      }
                    />
                  ) : null}
                  {found.length ? (
                    <ul className="grid gap-1 text-[13px] leading-[18px] text-destructive">
                      {found.map((entry) => (
                        <li key={`${entry.locale}-${entry.issue.code}`}>
                          {m.siteIssueIn({
                            issue: ISSUE_LABEL[entry.issue.code](),
                            language: LOCALE_NAME[entry.locale](),
                          })}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })}
            {shown && draft.sections.length === 0 ? (
              <p
                role="alert"
                className="text-[13px] leading-[18px] text-destructive"
              >
                {m.siteSectionsNeeded()}
              </p>
            ) : null}
            <div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className="max-md:h-10"
                    />
                  }
                >
                  <Plus aria-hidden />
                  {m.siteAddSection()}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {SECTION_TYPES.map((type) => {
                    const Icon = SECTION_ICON[type];
                    return (
                      <DropdownMenuItem key={type} onClick={() => add(type)}>
                        <Icon aria-hidden />
                        {SECTION_LABEL[type]()}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </FormSection>
        <FormSection title={m.sitePublishing()}>
          <SelectField
            id="page-when"
            label={m.siteWhenPublish()}
            width="reference"
            value={draft.when}
            options={[
              { value: "now", label: m.siteNow() },
              { value: "later", label: m.siteLater() },
            ]}
            onChange={(when) => set("when", when)}
          />
          {draft.when === "later" ? (
            <TextField
              id="page-publish-at"
              label={m.sitePublishAt()}
              type="datetime-local"
              width="reference"
              value={draft.publishAt}
              onChange={(event) => set("publishAt", event.target.value)}
              errors={
                shown && validity.publishAt ? [validity.publishAt] : undefined
              }
            />
          ) : null}
        </FormSection>
        {existing && existing.history.length > 0 ? (
          <FormSection
            title={m.siteHistory()}
            description={m.siteHistoryHint()}
          >
            <History
              kind="page"
              id={existing.id}
              rows={existing.history}
              languages={languages}
            />
          </FormSection>
        ) : null}
      </RecordForm>
      <Preview
        open={previewing}
        onOpenChange={setPreviewing}
        title={(locale) =>
          (locale === "ar" ? draft.titleAr : draft.titleEn) || primaryTitle
        }
        languages={languages}
        sections={(locale) => {
          const { content, translation } = contentOf(draft);
          return localizedSections(
            content,
            languages.other ? translation : null,
            languages.primary,
            locale,
          );
        }}
      />
    </>
  );
}
