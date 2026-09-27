import type { SiteLocale, SocialKind } from "@faridalms/domain/website";
import type { ReactNode } from "react";

import { Link, useLocation } from "@tanstack/react-router";
import {
  ChevronDown,
  Menu,
  TriangleAlert,
  Info,
  OctagonAlert,
} from "lucide-react";

import type { publicSiteQuery } from "~/queries/site";

import { buttonVariants } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";

import { ContactDetails, hasContact } from "./SectionView";

export type PublicSite = Awaited<
  ReturnType<NonNullable<ReturnType<typeof publicSiteQuery>["queryFn"]>>
>;
type MenuEntry = PublicSite["menu"][number];

const SOCIAL_NAME: Record<SocialKind, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
};

const BANNER = {
  info: { icon: Info, className: "bg-info/10 text-info" },
  warning: {
    icon: TriangleAlert,
    className: "bg-warning/15 text-warning-foreground dark:text-warning",
  },
  danger: {
    icon: OctagonAlert,
    className: "bg-destructive/10 text-destructive",
  },
} as const;

const navLink =
  "inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground";

/** The search a site link carries: the language, unless it is the site's first. */
export function langSearch(site: {
  locale: SiteLocale;
  primaryLocale: SiteLocale;
}) {
  return site.locale === site.primaryLocale ? {} : { lang: site.locale };
}

function EntryLink({
  entry,
  school,
  site,
  className,
}: {
  entry: MenuEntry;
  school: string;
  site: PublicSite;
  className?: string;
}) {
  return entry.isHome ? (
    <Link
      to="/site/$school"
      params={{ school }}
      search={langSearch(site)}
      className={className}
    >
      {entry.title}
    </Link>
  ) : (
    <Link
      to="/site/$school/pages/$slug"
      params={{ school, slug: entry.slug }}
      search={langSearch(site)}
      className={className}
    >
      {entry.title}
    </Link>
  );
}

/**
 * The frame of a school's public website: its name, its menu from the page
 * tree, the banner while one is up, and its contact details. Everything is in
 * the language the visitor chose, which the site may not offer; then it is in
 * the site's own.
 */
export function SiteShell({
  site,
  school,
  children,
}: {
  site: PublicSite;
  school: string;
  children: ReactNode;
}) {
  const locale = site.locale;
  const t = { locale };
  const location = useLocation();
  const other = site.locales.find((item) => item !== locale);
  const top = site.menu.filter((entry) => !entry.parentId);
  const childrenOf = (entry: MenuEntry) =>
    site.menu.filter((item) => item.parentId === entry.pageId);
  const banner = site.banner ? BANNER[site.banner.tone] : null;
  const newsLabel = m.siteNews({}, t);
  return (
    <div
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="flex min-h-dvh flex-col bg-background text-foreground"
    >
      <a
        href="#site-main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {m.siteSkipToContent({}, t)}
      </a>
      {site.banner && banner ? (
        <div className={cn("px-4 py-3 text-sm font-medium", banner.className)}>
          <p className="mx-auto flex max-w-6xl items-start gap-2">
            <banner.icon aria-hidden className="mt-0.5 size-4 shrink-0" />
            {site.banner.text}
          </p>
        </div>
      ) : null}
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link
            to="/site/$school"
            params={{ school }}
            search={langSearch(site)}
            className="grid min-w-0 gap-0.5"
          >
            <span className="truncate text-lg leading-6 font-semibold tracking-tight">
              {site.name}
            </span>
            {site.tagline ? (
              <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
                {site.tagline}
              </span>
            ) : null}
          </Link>
          <nav
            aria-label={m.siteNavigation({}, t)}
            className="ms-auto max-lg:hidden"
          >
            <ul className="flex items-center gap-1">
              {top.map((entry) => {
                const below = childrenOf(entry);
                return (
                  <li key={entry.pageId}>
                    {below.length ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger className={cn(navLink, "gap-1")}>
                          {entry.title}
                          <ChevronDown aria-hidden className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          lang={locale}
                          dir={locale === "ar" ? "rtl" : "ltr"}
                        >
                          {[entry, ...below].map((item) => (
                            <DropdownMenuItem
                              key={item.pageId}
                              render={
                                <EntryLink
                                  entry={item}
                                  school={school}
                                  site={site}
                                />
                              }
                            />
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <EntryLink
                        entry={entry}
                        school={school}
                        site={site}
                        className={navLink}
                      />
                    )}
                  </li>
                );
              })}
              <li>
                <Link
                  to="/site/$school/news"
                  params={{ school }}
                  search={langSearch(site)}
                  className={navLink}
                >
                  {newsLabel}
                </Link>
              </li>
            </ul>
          </nav>
          <div className="flex shrink-0 items-center gap-1 max-lg:ms-auto">
            {other ? (
              <a
                href={`${location.pathname}${other === site.primaryLocale ? "" : `?lang=${other}`}`}
                lang={other}
                hrefLang={other}
                className={buttonVariants({
                  variant: "ghost",
                  size: "sm",
                  className: "max-md:h-10",
                })}
              >
                {other === "ar" ? "العربية" : "English"}
              </a>
            ) : null}
            <Sheet>
              <SheetTrigger
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "size-10 lg:hidden",
                )}
                aria-label={m.siteMenu({}, t)}
              >
                <Menu aria-hidden />
              </SheetTrigger>
              <SheetContent
                side={locale === "ar" ? "left" : "right"}
                lang={locale}
                dir={locale === "ar" ? "rtl" : "ltr"}
              >
                <SheetHeader>
                  <SheetTitle>{m.siteMenu({}, t)}</SheetTitle>
                </SheetHeader>
                <nav aria-label={m.siteNavigation({}, t)} className="px-4 pb-6">
                  <ul className="grid gap-1">
                    {top.map((entry) => (
                      <li key={entry.pageId}>
                        <EntryLink
                          entry={entry}
                          school={school}
                          site={site}
                          className={cn(navLink, "w-full")}
                        />
                        {childrenOf(entry).length ? (
                          <ul className="ms-4 grid gap-1 border-s ps-2">
                            {childrenOf(entry).map((item) => (
                              <li key={item.pageId}>
                                <EntryLink
                                  entry={item}
                                  school={school}
                                  site={site}
                                  className={cn(navLink, "w-full")}
                                />
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                    <li>
                      <Link
                        to="/site/$school/news"
                        params={{ school }}
                        search={langSearch(site)}
                        className={cn(navLink, "w-full")}
                      >
                        {newsLabel}
                      </Link>
                    </li>
                  </ul>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main
        id="site-main"
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:py-12"
      >
        {children}
      </main>
      <footer className="border-t bg-muted/30">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
          <div className="grid content-start gap-1">
            <p className="text-base font-semibold">{site.name}</p>
            {site.tagline ? (
              <p className="text-sm text-muted-foreground">{site.tagline}</p>
            ) : null}
          </div>
          {hasContact(site.contact) ? (
            <div className="grid content-start gap-2">
              <h2 className="text-sm font-semibold">{m.siteContact({}, t)}</h2>
              <ContactDetails contact={site.contact} />
            </div>
          ) : null}
          {site.socialLinks.length ? (
            <div className="grid content-start gap-2">
              <h2 className="text-sm font-semibold">{m.siteFollow({}, t)}</h2>
              <ul className="grid gap-1 text-sm">
                {site.socialLinks.map((link) => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      rel="noopener noreferrer"
                      className="inline-flex min-h-8 items-center hover:underline"
                    >
                      {SOCIAL_NAME[link.kind]}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="border-t">
          <p className="mx-auto max-w-6xl px-4 py-4 text-[13px] text-muted-foreground">
            <a href="/sign-in" className="hover:underline">
              {m.sitePortalSignIn({}, t)}
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
