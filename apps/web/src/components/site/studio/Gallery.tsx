import type {
  PageSection,
  SectionCategory,
  SectionType,
  SiteLocale,
} from "@faridalms/domain/site-sections";
import type { PageTemplate } from "@faridalms/domain/site-templates";

import {
  SECTION_CATEGORIES,
  SECTION_SPECS,
  SECTION_TYPES,
} from "@faridalms/domain/site-sections";
import {
  buildSection,
  buildTemplate,
  PAGE_TEMPLATE_IDS,
} from "@faridalms/domain/site-templates";
import { cn } from "@faridalms/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@faridalms/ui/dialog";
import { Input } from "@faridalms/ui/input";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import * as m from "~/i18n/messages";

import type { RenderContext } from "../render/parts";

import { PageSections } from "../render/page";
import { SiteSection } from "../render/sections";
import { Viewport } from "./Canvas";
import {
  CATEGORY_LABEL,
  SECTION_HINT,
  SECTION_LABEL,
  TEMPLATE_HINT,
  TEMPLATE_LABEL,
  VARIANT_LABEL,
} from "./labels";

const THUMB_WIDTH = 1200;

/** A section drawn small, for choosing; it cannot be focused or clicked into. */
function Thumbnail({
  section,
  context,
}: {
  section: PageSection;
  context: RenderContext;
}) {
  return (
    <div
      aria-hidden
      inert
      className="pointer-events-none max-h-56 overflow-hidden bg-white"
    >
      <Viewport
        width={THUMB_WIDTH}
        theme={context.theme}
        locale={context.locale}
      >
        <SiteSection
          section={section}
          shownIn={context.locale}
          context={context}
          first={false}
        />
      </Viewport>
    </div>
  );
}

export interface Inserted {
  content: PageSection;
  translation: PageSection;
}

function TypeCard({
  type,
  context,
  primary,
  onPick,
}: {
  type: SectionType;
  context: RenderContext;
  primary: SiteLocale;
  onPick: (inserted: Inserted) => void;
}) {
  const variants = SECTION_SPECS[type].variants as readonly string[];
  const [variant, setVariant] = useState(variants[0] ?? "");
  const sample = useMemo(
    () => buildSection(type, variant as never, context.locale),
    [type, variant, context.locale],
  );
  const labels = VARIANT_LABEL[type] as Record<string, () => string>;
  const insert = (chosen: string) =>
    onPick(buildSection(type, chosen as never, primary));
  return (
    <li className="grid content-start overflow-hidden rounded-xl border bg-card shadow-xs">
      {/* The preview holds live buttons of its own, so the card's button
          lies over it rather than around it. */}
      <div className="group relative grid text-start">
        <button
          type="button"
          onClick={() => insert(variant)}
          className="absolute inset-0 z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          aria-label={m.siteAddSectionNamed({
            section: SECTION_LABEL[type](),
            layout: labels[variant]?.() ?? "",
          })}
        />
        <div className="border-b transition-opacity group-hover:opacity-90">
          <Thumbnail section={sample.content} context={context} />
        </div>
        <span className="grid gap-0.5 px-3 pt-3">
          <span className="text-sm font-semibold">{SECTION_LABEL[type]()}</span>
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {SECTION_HINT[type]()}
          </span>
        </span>
      </div>
      {variants.length > 1 ? (
        <fieldset className="flex flex-wrap gap-1 p-3">
          <legend className="sr-only">{m.siteLayouts()}</legend>
          {variants.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === variant}
              onMouseEnter={() => setVariant(option)}
              onFocus={() => setVariant(option)}
              onClick={() => insert(option)}
              className="rounded-full border px-2.5 py-1 text-xs font-medium hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary max-md:py-2"
            >
              {labels[option]?.()}
            </button>
          ))}
        </fieldset>
      ) : (
        <div className="p-1.5" />
      )}
    </li>
  );
}

/** Every section the page can take, drawn in the site's own theme, grouped by what it is for. */
export function SectionGallery({
  open,
  onOpenChange,
  context,
  primary,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: RenderContext;
  primary: SiteLocale;
  onPick: (inserted: Inserted) => void;
}) {
  const [category, setCategory] = useState<SectionCategory | "all">("all");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase();
  const types = SECTION_TYPES.filter(
    (type) =>
      (category === "all" || SECTION_SPECS[type].category === category) &&
      (!needle ||
        `${SECTION_LABEL[type]()} ${SECTION_HINT[type]()}`
          .toLocaleLowerCase()
          .includes(needle)),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-[min(1180px,calc(100%-2rem))]">
        <DialogHeader className="gap-3 border-b px-5 py-4">
          <DialogTitle>{m.siteAddSection()}</DialogTitle>
          <DialogDescription>{m.siteGalleryHint()}</DialogDescription>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search
                aria-hidden
                className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={m.siteSearchSections()}
                aria-label={m.siteSearchSections()}
                className="ps-8 max-md:h-10"
              />
            </div>
            <fieldset className="flex flex-wrap gap-1">
              <legend className="sr-only">{m.siteSectionGroups()}</legend>
              {(["all", ...SECTION_CATEGORIES] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={category === option}
                  onClick={() => setCategory(option)}
                  className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted aria-pressed:bg-foreground aria-pressed:text-background"
                >
                  {option === "all"
                    ? m.siteAllSections()
                    : CATEGORY_LABEL[option]()}
                </button>
              ))}
            </fieldset>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/40 p-5">
          {types.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {m.siteNoSectionsFound()}
            </p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {types.map((type) => (
                <TypeCard
                  key={type}
                  type={type}
                  context={context}
                  primary={primary}
                  onPick={onPick}
                />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The page templates, each drawn in the site's theme, for starting a new page. */
export function TemplateGallery({
  context,
  onPick,
}: {
  context: RenderContext;
  onPick: (template: PageTemplate) => void;
}) {
  const built = useMemo(
    () =>
      Object.fromEntries(
        PAGE_TEMPLATE_IDS.map((template) => [
          template,
          buildTemplate(template, context.locale).content,
        ]),
      ),
    [context.locale],
  );
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {PAGE_TEMPLATE_IDS.map((template) => (
        <li key={template}>
          <div className="group relative grid w-full overflow-hidden rounded-xl border bg-card text-start shadow-xs transition-shadow hover:shadow-md">
            <button
              type="button"
              onClick={() => onPick(template)}
              aria-label={`${TEMPLATE_LABEL[template]()}: ${TEMPLATE_HINT[template]()}`}
              className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:outline-primary"
            />
            <div
              aria-hidden
              inert
              className={cn(
                "pointer-events-none h-72 overflow-hidden border-b bg-white",
                template === "blank" && "grid place-items-center",
              )}
            >
              {template === "blank" ? (
                <span className="text-sm text-muted-foreground">
                  {TEMPLATE_HINT.blank()}
                </span>
              ) : (
                <Viewport
                  width={THUMB_WIDTH}
                  theme={context.theme}
                  locale={context.locale}
                >
                  <PageSections
                    sections={(built[template] ?? []).map((section) => ({
                      section,
                      locale: context.locale,
                    }))}
                    title=""
                    context={context}
                  />
                </Viewport>
              )}
            </div>
            <span className="grid gap-0.5 p-4">
              <span className="font-semibold">
                {TEMPLATE_LABEL[template]()}
              </span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {TEMPLATE_HINT[template]()}
              </span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
