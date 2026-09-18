import type { SiteLocale } from "@faridalms/domain/site";
import type { CSSProperties, ReactNode } from "react";

import { Link, useLocation } from "@tanstack/react-router";
import { ChevronDown, Mail, MapPin, Phone } from "lucide-react";

import type { getPublicSite } from "~/server/site";

import { buttonVariants } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import * as m from "~/i18n/messages";
import { setLocale } from "~/i18n/runtime";
import { cn } from "~/utils/cn";

export type PublicSite = Awaited<ReturnType<typeof getPublicSite>>;

export function siteMediaUrl(school: string) {
  return (fileId: string) => `/site-media/${school}/${fileId}`;
}

export function siteTagline(
  settings: PublicSite["settings"],
  locale: SiteLocale,
) {
  return locale === "ar" && settings.taglineAr
    ? settings.taglineAr
    : settings.tagline;
}

const navLink =
  "rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground";

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
  const location = useLocation();
  const other: SiteLocale = locale === "ar" ? "en" : "ar";
  const groups = new Map<string, PublicSite["navigation"]>();
  for (const item of site.navigation) {
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  const media = siteMediaUrl(school);
  const switchLocale = () => {
    const url = new URL(location.href, "http://localhost");
    url.searchParams.set("lang", other);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    void setLocale(other);
  };
  return (
    <div
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className="flex min-h-dvh flex-col bg-background text-foreground"
      style={
        {
          "--primary": site.settings.primaryColor,
          "--ring": site.settings.primaryColor,
        } as CSSProperties
      }
    >
      <a
        href="#site-main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {m.siteSkipToContent()}
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link
            to="/site/$school"
            params={{ school }}
            search={{ lang: locale }}
            className="flex items-center gap-3 text-lg font-semibold tracking-tight"
          >
            {site.settings.logoFileId ? (
              <img
                src={media(site.settings.logoFileId)}
                alt=""
                className="h-10 w-auto"
              />
            ) : null}
            <span>{site.school.name}</span>
          </Link>
          <div className="ms-auto flex items-center gap-2">
            <button
              type="button"
              onClick={switchLocale}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
              lang={other}
            >
              {other === "ar" ? "العربية" : "English"}
            </button>
            <a
              href="/sign-in"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {m.sitePortalSignIn()}
            </a>
          </div>
          <nav
            aria-label={m.siteNavigation()}
            className="flex w-full flex-wrap items-center gap-1 border-t pt-2 lg:w-auto lg:border-t-0 lg:pt-0"
          >
            {[...groups.entries()].map(([group, items]) =>
              group ? (
                <DropdownMenu key={group}>
                  <DropdownMenuTrigger
                    className={cn(navLink, "flex items-center gap-1")}
                  >
                    {group}
                    <ChevronDown className="size-4" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {items.map((item) => (
                      <DropdownMenuItem
                        key={item.slug}
                        render={
                          <Link
                            to="/site/$school/pages/$slug"
                            params={{ school, slug: item.slug }}
                            search={{ lang: locale }}
                          />
                        }
                      >
                        {item.title}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                items.map((item) => (
                  <Link
                    key={item.slug}
                    to="/site/$school/pages/$slug"
                    params={{ school, slug: item.slug }}
                    search={{ lang: locale }}
                    className={navLink}
                  >
                    {item.title}
                  </Link>
                ))
              ),
            )}
            <Link
              to="/site/$school/blog"
              params={{ school }}
              search={{ lang: locale }}
              className={navLink}
            >
              {m.siteBlog()}
            </Link>
          </nav>
        </div>
      </header>
      <main
        id="site-main"
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8"
      >
        {children}
      </main>
      <footer className="border-t bg-muted/30">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
          <div>
            <p className="text-base font-semibold">{site.school.name}</p>
            {siteTagline(site.settings, locale) ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {siteTagline(site.settings, locale)}
              </p>
            ) : null}
          </div>
          <div>
            <h2 className="text-sm font-semibold">{m.siteContact()}</h2>
            <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
              {site.settings.address ? (
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {site.settings.mapUrl ? (
                    <a
                      href={site.settings.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground hover:underline"
                    >
                      {site.settings.address}
                    </a>
                  ) : (
                    <span>{site.settings.address}</span>
                  )}
                </li>
              ) : null}
              {site.settings.contactPhone ? (
                <li className="flex items-center gap-2">
                  <Phone className="size-4 shrink-0" aria-hidden />
                  <a
                    href={`tel:${site.settings.contactPhone}`}
                    dir="ltr"
                    className="hover:text-foreground hover:underline"
                  >
                    {site.settings.contactPhone}
                  </a>
                </li>
              ) : null}
              {site.settings.contactEmail ? (
                <li className="flex items-center gap-2">
                  <Mail className="size-4 shrink-0" aria-hidden />
                  <a
                    href={`mailto:${site.settings.contactEmail}`}
                    className="hover:text-foreground hover:underline"
                  >
                    {site.settings.contactEmail}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
          {site.settings.socialLinks.length > 0 ? (
            <div>
              <h2 className="text-sm font-semibold">{m.siteFollow()}</h2>
              <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                {site.settings.socialLinks.map((link) => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground hover:underline"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <p className="border-t px-4 py-4 text-center text-xs text-muted-foreground">
          {m.sitePoweredBy()}
        </p>
      </footer>
    </div>
  );
}
