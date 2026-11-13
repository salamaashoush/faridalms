import type { SiteLocale } from "@faridalms/domain/site-sections";
import type {
  BuiltStarter,
  SiteModules,
  StarterId,
} from "@faridalms/domain/site-templates";

import { reviewStarter } from "@faridalms/domain/site-starters";
import { buildStarter, STARTERS } from "@faridalms/domain/site-templates";
import { resolveTheme } from "@faridalms/domain/site-theme";
import { blankPage, localizedSections } from "@faridalms/domain/website";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@faridalms/ui/system/dialog";
import { Segmented } from "@faridalms/ui/system/panel";
import { Check, Monitor, Smartphone } from "lucide-react";
import { useMemo, useState } from "react";

import { LOCALE_NAME } from "~/components/content/languages";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

import type { SiteFrameModel } from "./render/frame";
import type { NewsItem, SiteContact } from "./render/parts";

import { SiteFrame } from "./render/frame";
import { withNews } from "./render/frame-model";
import { opensOnPicture, PageSections } from "./render/page";
import { DEVICES, Viewport } from "./studio/Canvas";
import { STARTER_LABEL } from "./studio/labels";

type Width = "desktop" | "phone";

/** The header and footer a starter's site would have, in one language. */
function starterFrame(
  built: BuiltStarter,
  locale: SiteLocale,
  name: string,
  currentHref: string,
): SiteFrameModel {
  const say = (words: { en: string; ar: string }) => words[locale] || words.en;
  const link = (entry: {
    id: string;
    label: { en: string; ar: string };
    href: string;
  }) => ({ id: entry.id, label: say(entry.label), href: entry.href });
  const { chrome } = built;
  return {
    name,
    tagline: "",
    logoUrl: null,
    banner: null,
    utility: chrome.utility.map(link),
    actions: chrome.actions.map((entry) => ({
      ...link(entry),
      style: entry.style,
    })),
    menu: withNews(
      built.pages.map(({ plan }) => ({
        id: plan.slug,
        parentId: null,
        label: plan.title[locale === "ar" ? 1 : 0],
        href: plan.home ? "/" : `/pages/${plan.slug}`,
      })),
      [...chrome.utility, ...chrome.actions],
      m.siteNews({}, { locale }),
    ),
    footerColumns: chrome.footerColumns.map((column) => ({
      id: column.id,
      title: say(column.title),
      links: column.links.map(link),
    })),
    footerNote: say(chrome.footerNote),
    dock: chrome.dock,
    socialLinks: [],
    otherLanguage: null,
    currentHref,
    signInHref: "/sign-in",
  };
}

export interface StarterPreviewProps {
  starter: StarterId | null;
  modules: SiteModules;
  /** The site's first language, which the starter's words are built in. */
  primary: SiteLocale;
  school: string;
  schoolName: { en: string; ar: string | null };
  news: NewsItem[];
  contact: SiteContact;
  onOpenChange: (open: boolean) => void;
  onUse: (starter: StarterId) => void;
}

/**
 * A ready-made site as it would be built for the school's modules, page by
 * page, in its own theme, in either language and at a desktop's or a
 * phone's width, drawn by the components visitors' pages are drawn by.
 * Nothing is saved; pages left out for a module the school lacks are named.
 */
export function StarterPreview({
  starter,
  modules,
  primary,
  school,
  schoolName,
  news,
  contact,
  onOpenChange,
  onUse,
}: StarterPreviewProps) {
  const [slug, setSlug] = useState<string | null>(null);
  const [locale, setLocale] = useState<SiteLocale>(primary);
  const [width, setWidth] = useState<Width>("desktop");
  const built = useMemo(
    () => (starter ? buildStarter(STARTERS[starter], primary, modules) : null),
    [starter, primary, modules],
  );
  const titleAt = getLocale() === "ar" ? 1 : 0;
  const shown =
    built?.pages.find(({ plan }) => plan.slug === slug) ?? built?.pages[0];
  const left = starter
    ? reviewStarter(STARTERS[starter], modules, []).filter(
        (row) => row.fate === "without",
      )
    : [];
  const sections = shown
    ? localizedSections(
        blankPage(shown.built.content),
        blankPage(shown.built.translation),
        primary,
        locale,
      )
    : [];
  const theme = resolveTheme({
    id: starter ? STARTERS[starter].theme : "meridian",
    palette: {},
    fonts: {},
  });
  const currentHref = shown?.plan.home
    ? "/"
    : `/pages/${shown?.plan.slug ?? ""}`;
  const close = (open: boolean) => {
    if (!open) {
      setSlug(null);
      setLocale(primary);
      setWidth("desktop");
    }
    onOpenChange(open);
  };
  return (
    <Dialog open={starter !== null} onOpenChange={close}>
      <DialogContent className="grid h-[calc(100dvh-2rem)] max-h-none grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 sm:max-w-[min(1280px,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle>
            {starter
              ? m.siteStarterPreviewTitle({ starter: STARTER_LABEL[starter]() })
              : null}
          </DialogTitle>
          <DialogDescription>{m.siteStarterPreviewHint()}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label={m.siteLanguage()}
            value={locale}
            options={(["en", "ar"] as const).map((value) => ({
              value,
              label: LOCALE_NAME[value](),
            }))}
            onChange={setLocale}
          />
          <Segmented
            label={m.siteDevice()}
            value={width}
            options={[
              {
                value: "desktop",
                label: m.siteDesktop(),
                icon: <Monitor aria-hidden className="size-4" />,
              },
              {
                value: "phone",
                label: m.sitePhone(),
                icon: <Smartphone aria-hidden className="size-4" />,
              },
            ]}
            onChange={setWidth}
          />
        </div>
        <div className="grid min-h-0 gap-3 md:grid-cols-[13rem_minmax(0,1fr)]">
          <nav
            aria-label={m.siteStarterPreviewPages()}
            className="grid content-start gap-1 overflow-y-auto max-md:max-h-32"
          >
            {built?.pages.map(({ plan }) => (
              <Button
                key={plan.slug}
                type="button"
                variant="ghost"
                aria-pressed={plan === shown?.plan}
                className="justify-start aria-pressed:bg-accent aria-pressed:font-semibold max-md:h-10"
                onClick={() => setSlug(plan.slug)}
              >
                {plan.title[titleAt]}
              </Button>
            ))}
            {left.map((row) => (
              <p
                key={row.page.slug}
                className="px-3 py-1.5 text-[13px] leading-[18px] text-muted-foreground"
              >
                <span className="font-medium">{row.page.title[titleAt]}</span>
                {" · "}
                {m.siteStarterLeftOut()}
              </p>
            ))}
          </nav>
          <div
            data-preview
            className="min-h-0 overflow-auto rounded-lg bg-[#e9ebef] p-3 dark:bg-[#1b1d22]"
          >
            <Viewport
              width={DEVICES[width]}
              theme={theme}
              locale={locale}
              className={cn("mx-auto", width === "phone" && "max-w-full")}
            >
              {built && shown ? (
                <div className="overflow-hidden rounded-[10px] shadow-[0_8px_40px_rgba(15,23,42,.18)]">
                  <SiteFrame
                    frame={starterFrame(
                      built,
                      locale,
                      (locale === "ar" ? schoolName.ar : null) || schoolName.en,
                      currentHref,
                    )}
                    context={{
                      school,
                      locale,
                      theme,
                      fileUrl: () => null,
                      news,
                      contact,
                      editing: true,
                    }}
                    overlay={opensOnPicture(sections)}
                  >
                    <PageSections
                      sections={sections}
                      title={shown.plan.title[locale === "ar" ? 1 : 0]}
                      context={{
                        school,
                        locale,
                        theme,
                        fileUrl: () => null,
                        news,
                        contact,
                        editing: true,
                      }}
                    />
                  </SiteFrame>
                </div>
              ) : null}
            </Viewport>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() => close(false)}
          >
            {m.commonClose()}
          </Button>
          <Button
            type="button"
            className="max-md:h-10"
            onClick={() => {
              if (!starter) return;
              close(false);
              onUse(starter);
            }}
          >
            <Check aria-hidden />
            {m.siteUseStarter()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
