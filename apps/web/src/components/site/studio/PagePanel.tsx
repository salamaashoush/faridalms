import type { SiteLocale } from "@faridalms/domain/site-sections";

import { CheckboxRow } from "~/components/people/fields";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";

import type { Languages, PageDraft } from "./draft";

import { LOCALE_NAME } from "../format";
import { History } from "../History";
import { PanelGroup, StudioField } from "./controls";

type Version = Parameters<typeof History>[0]["rows"][number];

/** The page itself: its titles, address, place in the menu, search description and history. */
export function PagePanel({
  draft,
  languages,
  isHome,
  parents,
  errors,
  history,
  pageId,
  onChange,
  onSlugTouched,
}: {
  draft: PageDraft;
  languages: Languages;
  isHome: boolean;
  parents: { id: string; title: string }[];
  errors: { title: string | null; slug: string | null };
  history: Version[];
  pageId: string | null;
  onChange: (change: Partial<PageDraft>, key?: string) => void;
  onSlugTouched: () => void;
}) {
  const locales = languages.other
    ? [languages.primary, languages.other]
    : [languages.primary];
  const description = (locale: SiteLocale) =>
    locale === languages.primary ? draft.description : draft.otherDescription;
  return (
    <div>
      <PanelGroup title={m.sitePageDetails()}>
        {locales.map((locale) => {
          const key = locale === "ar" ? "titleAr" : "titleEn";
          const id = `page-${key}`;
          const error = locale === languages.primary ? errors.title : null;
          return (
            <StudioField
              key={locale}
              id={id}
              label={locale === "ar" ? m.siteTitleAr() : m.siteTitleEn()}
              hint={
                error ? (
                  <span className="text-destructive">{error}</span>
                ) : undefined
              }
            >
              <Input
                id={id}
                value={draft[key]}
                maxLength={200}
                lang={locale}
                dir={locale === "ar" ? "rtl" : "ltr"}
                aria-invalid={error ? true : undefined}
                className="max-md:h-10"
                onChange={(event) =>
                  onChange({ [key]: event.target.value }, `page:${key}`)
                }
              />
            </StudioField>
          );
        })}
        <StudioField
          id="page-slug"
          label={m.siteSlug()}
          hint={
            errors.slug ? (
              <span className="text-destructive">{errors.slug}</span>
            ) : isHome ? (
              m.siteHomeAddress()
            ) : (
              m.sitePageSlugHint({ slug: draft.slug || "…" })
            )
          }
        >
          <Input
            id="page-slug"
            dir="ltr"
            value={draft.slug}
            maxLength={80}
            autoComplete="off"
            aria-invalid={errors.slug ? true : undefined}
            className="max-md:h-10"
            onChange={(event) => {
              onSlugTouched();
              onChange({ slug: event.target.value.toLowerCase() }, "page:slug");
            }}
          />
        </StudioField>
        {isHome ? null : (
          <StudioField
            id="page-parent"
            label={m.siteParent()}
            hint={m.siteParentHint()}
          >
            <Select
              value={draft.parentId || "none"}
              onValueChange={(value) =>
                onChange({ parentId: value && value !== "none" ? value : "" })
              }
            >
              <SelectTrigger id="page-parent" className="w-full max-md:h-10">
                <SelectValue>
                  {parents.find((page) => page.id === draft.parentId)?.title ??
                    m.siteNoParent()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{m.siteNoParent()}</SelectItem>
                {parents.map((page) => (
                  <SelectItem key={page.id} value={page.id}>
                    {page.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </StudioField>
        )}
        <CheckboxRow
          label={m.siteShowInMenu()}
          hint={m.siteShowInMenuHint()}
          checked={draft.inMenu}
          onChange={(inMenu) => onChange({ inMenu })}
        />
      </PanelGroup>
      <PanelGroup
        title={m.siteSearchDescription()}
        hint={m.siteSearchDescriptionHint()}
      >
        {locales.map((locale) => (
          <StudioField
            key={locale}
            id={`page-description-${locale}`}
            label={LOCALE_NAME[locale]()}
            counter={
              <span className="text-xs text-muted-foreground tabular-nums">
                {description(locale).length}/160
              </span>
            }
          >
            <Textarea
              id={`page-description-${locale}`}
              rows={3}
              maxLength={300}
              lang={locale}
              dir={locale === "ar" ? "rtl" : "ltr"}
              value={description(locale)}
              onChange={(event) =>
                onChange(
                  locale === languages.primary
                    ? { description: event.target.value }
                    : { otherDescription: event.target.value },
                  `page:description:${locale}`,
                )
              }
            />
          </StudioField>
        ))}
      </PanelGroup>
      {pageId && history.length ? (
        <PanelGroup title={m.siteHistory()} hint={m.siteHistoryHint()}>
          <History
            kind="page"
            id={pageId}
            rows={history}
            languages={languages}
          />
        </PanelGroup>
      ) : null}
    </div>
  );
}
