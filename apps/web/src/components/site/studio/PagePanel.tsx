import type { SiteLocale } from "@faridalms/domain/site-sections";

import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@faridalms/ui/select";
import { PanelGroup } from "@faridalms/ui/system/panel";
import { Textarea } from "@faridalms/ui/textarea";
import { History } from "lucide-react";

import { LOCALE_NAME } from "~/components/content/languages";
import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";

import type { Languages, PageDraft } from "./draft";

import { PictureField } from "../PictureField";
import { StudioField } from "./controls";
import { canonicalValid } from "./draft";

export interface PagePanelProps {
  draft: PageDraft;
  languages: Languages;
  isHome: boolean;
  parents: { id: string; title: string }[];
  errors: { title: string | null; slug: string | null };
  /** Names who the social picture shows, which decides whether it may go on the website. */
  onPeople: (fileId: string) => void;
  /** Opens the page's earlier versions, once it is stored. */
  onHistory?: () => void;
  onChange: (change: Partial<PageDraft>, key?: string) => void;
  onSlugTouched: () => void;
}

/**
 * The page itself: its titles, address and place in the menu, how it
 * presents itself to search engines and shared links, and the way to its
 * earlier versions.
 */
export function PagePanel({
  draft,
  languages,
  isHome,
  parents,
  errors,
  onPeople,
  onHistory,
  onChange,
  onSlugTouched,
}: PagePanelProps) {
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
                onChange({
                  parentId: value && value !== "none" ? value : "",
                })
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
      <PanelGroup
        title={m.siteSocialPicture()}
        hint={m.siteSocialPictureHint()}
      >
        {locales.map((locale) => {
          const key =
            locale === languages.primary
              ? "socialPicture"
              : "otherSocialPicture";
          const picture = draft[key];
          return (
            <StudioField
              key={locale}
              label={LOCALE_NAME[locale]()}
              hint={
                locale === languages.primary
                  ? undefined
                  : m.siteSocialPictureOther({
                      language: LOCALE_NAME[languages.primary](),
                    })
              }
            >
              <PictureField
                fileId={picture.fileId}
                label={m.siteSocialPicture()}
                onPeople={onPeople}
                onChange={(fileId) =>
                  onChange({
                    [key]: { fileId, alt: fileId ? picture.alt : "" },
                  })
                }
              />
              {picture.fileId ? (
                <StudioField
                  id={`page-social-alt-${locale}`}
                  label={m.siteSocialPictureAlt()}
                >
                  <Input
                    id={`page-social-alt-${locale}`}
                    value={picture.alt}
                    maxLength={300}
                    lang={locale}
                    dir={locale === "ar" ? "rtl" : "ltr"}
                    className="max-md:h-10"
                    onChange={(event) =>
                      onChange(
                        { [key]: { ...picture, alt: event.target.value } },
                        `page:social-alt:${locale}`,
                      )
                    }
                  />
                </StudioField>
              ) : null}
            </StudioField>
          );
        })}
      </PanelGroup>
      <PanelGroup title={m.siteSearchEngines()}>
        <CheckboxRow
          label={m.siteKeepOutOfSearch()}
          hint={m.siteKeepOutOfSearchHint()}
          checked={!draft.indexed}
          onChange={(hidden) => onChange({ indexed: !hidden })}
        />
        {locales.map((locale) => {
          const key =
            locale === languages.primary ? "canonical" : "otherCanonical";
          const valid = canonicalValid(draft[key]);
          return (
            <StudioField
              key={locale}
              id={`page-canonical-${locale}`}
              label={
                locales.length > 1
                  ? m.siteCanonicalIn({ language: LOCALE_NAME[locale]() })
                  : m.siteCanonical()
              }
              hint={
                valid ? (
                  m.siteCanonicalHint()
                ) : (
                  <span className="text-destructive">
                    {m.siteAddressNeeded()}
                  </span>
                )
              }
            >
              <Input
                id={`page-canonical-${locale}`}
                dir="ltr"
                value={draft[key]}
                maxLength={2048}
                autoComplete="off"
                placeholder="https://"
                aria-invalid={valid ? undefined : true}
                className="max-md:h-10"
                onChange={(event) =>
                  onChange(
                    { [key]: event.target.value },
                    `page:canonical:${locale}`,
                  )
                }
              />
            </StudioField>
          );
        })}
      </PanelGroup>
      {onHistory ? (
        <PanelGroup title={m.siteHistory()} hint={m.siteHistoryHint()}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start max-md:h-10"
            onClick={onHistory}
          >
            <History aria-hidden />
            {m.docHistory()}
          </Button>
        </PanelGroup>
      ) : null}
    </div>
  );
}
