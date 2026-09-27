import type { PageSection, SiteLocale } from "@faridalms/domain/website";

import { Monitor, Smartphone, X } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "~/components/ui/dialog";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";

import type { Languages } from "./SectionFields";

import { LOCALE_NAME } from "./format";
import { SectionView } from "./SectionView";

/**
 * The page as visitors would see it, in each language and at desktop or
 * phone width, before anything is published. Links do not navigate here, and
 * a news section shows no posts.
 */
export function Preview({
  open,
  onOpenChange,
  title,
  languages,
  sections,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: (locale: SiteLocale) => string;
  languages: Languages;
  sections: (
    locale: SiteLocale,
  ) => { section: PageSection; locale: SiteLocale }[];
}) {
  const [locale, setLocale] = useState<SiteLocale>(languages.primary);
  const [phone, setPhone] = useState(false);
  const locales = languages.other
    ? [languages.primary, languages.other]
    : [languages.primary];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 p-0 sm:max-w-[min(1200px,calc(100%-2rem))]"
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <DialogTitle className="me-auto text-base font-semibold">
            {m.sitePreviewOf({ title: title(languages.primary) || "…" })}
          </DialogTitle>
          {locales.length > 1 ? (
            <fieldset className="flex gap-1">
              <legend className="sr-only">{m.siteLanguage()}</legend>
              {locales.map((item) => (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={item === locale ? "secondary" : "ghost"}
                  aria-pressed={item === locale}
                  className="max-md:h-10"
                  onClick={() => setLocale(item)}
                >
                  {LOCALE_NAME[item]()}
                </Button>
              ))}
            </fieldset>
          ) : null}
          <fieldset className="flex gap-1">
            <legend className="sr-only">{m.siteWidth()}</legend>
            <Button
              type="button"
              size="icon-sm"
              variant={phone ? "ghost" : "secondary"}
              aria-pressed={!phone}
              aria-label={m.siteDesktop()}
              className="max-md:size-10"
              onClick={() => setPhone(false)}
            >
              <Monitor aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant={phone ? "secondary" : "ghost"}
              aria-pressed={phone}
              aria-label={m.sitePhone()}
              className="max-md:size-10"
              onClick={() => setPhone(true)}
            >
              <Smartphone aria-hidden />
            </Button>
          </fieldset>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={m.commonClose()}
            className="max-md:size-10"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden />
          </Button>
        </div>
        <div className="overflow-auto bg-muted/40 p-4">
          <div
            lang={locale}
            dir={locale === "ar" ? "rtl" : "ltr"}
            className={cn(
              "mx-auto rounded-lg border bg-background p-6",
              phone ? "max-w-[390px]" : "max-w-6xl",
            )}
          >
            <h1 className="mb-8 text-3xl leading-tight font-semibold tracking-tight">
              {title(locale)}
            </h1>
            <SectionView
              sections={sections(locale)}
              locale={locale}
              context={{
                school: "",
                fileUrl: (fileId) => `/files/${fileId}`,
                news: [],
                contact: null,
                locale,
                preview: true,
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
