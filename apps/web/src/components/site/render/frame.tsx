import type { SiteLocale, SocialKind } from "@faridalms/domain/website";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import {
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandLinkedin,
  IconBrandTiktok,
  IconBrandWhatsapp,
  IconBrandX,
  IconBrandYoutube,
} from "@tabler/icons-react";
import { useHydrated } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronDown,
  Globe,
  Info,
  Menu,
  Moon,
  OctagonAlert,
  Sun,
  TriangleAlert,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import * as m from "~/i18n/messages";
import { numberLocale } from "~/utils/digits";

import type { SiteFrameModel } from "./frame-model";
import type { RenderContext } from "./parts";

import {
  childrenOf,
  footerColumns,
  navEntries,
  navFits,
  primaryAction,
  quietActions,
  topLevel,
  utilityLinks,
} from "./frame-model";
import { useReveal } from "./motion";
import { SiteAnchor } from "./parts";
import { ContactList } from "./sections";
import {
  duotoneTables,
  overMediaStyle,
  schemeStyle,
  themeAttributes,
  themeStyle,
} from "./theme";

export type { FrameLink, FrameMenuEntry, SiteFrameModel } from "./frame-model";

const SOCIAL: Record<
  SocialKind,
  { name: string; icon: typeof IconBrandFacebook }
> = {
  facebook: { name: "Facebook", icon: IconBrandFacebook },
  instagram: { name: "Instagram", icon: IconBrandInstagram },
  x: { name: "X", icon: IconBrandX },
  youtube: { name: "YouTube", icon: IconBrandYoutube },
  linkedin: { name: "LinkedIn", icon: IconBrandLinkedin },
  tiktok: { name: "TikTok", icon: IconBrandTiktok },
  whatsapp: { name: "WhatsApp", icon: IconBrandWhatsapp },
};

/** Each language named in itself, in full and as a header shows it. */
const LANGUAGE: Record<SiteLocale, { name: string; short: string }> = {
  en: { name: "English", short: "EN" },
  ar: { name: "العربية", short: "عربي" },
};

const BANNER_ICON = {
  info: Info,
  warning: TriangleAlert,
  danger: OctagonAlert,
} as const;

type FrameProps = { frame: SiteFrameModel; context: RenderContext };

function Brand({
  frame,
  context,
  large = false,
}: FrameProps & { large?: boolean }) {
  return (
    <SiteAnchor
      href={frame.homeHref ?? "/"}
      context={context}
      className={cn(
        "site-brand",
        large && "@5xl/site:flex-col @5xl/site:text-center",
      )}
    >
      {frame.logoUrl ? (
        <img
          src={frame.logoUrl}
          alt=""
          className={cn("site-brand-logo", large && "@5xl/site:h-14")}
        />
      ) : null}
      <span
        className={cn(
          "grid min-w-0",
          large && "@5xl/site:justify-items-center",
        )}
      >
        <span className={cn("site-brand-name", large && "@5xl/site:text-2xl")}>
          {frame.name}
        </span>
        {frame.tagline ? (
          <span className="site-brand-tagline">{frame.tagline}</span>
        ) : null}
      </span>
    </SiteAnchor>
  );
}

/**
 * The way to the page in the other language, named in that language and
 * set in its own face: a small globe and "عربي" on an English page, "EN"
 * on an Arabic one.
 */
function LanguageSwitch({
  frame,
  context,
  full = false,
  className,
}: FrameProps & { full?: boolean; className?: string }) {
  const other = frame.otherLanguage;
  if (!other) return null;
  const words = LANGUAGE[other.locale];
  const body = (
    <>
      <Globe aria-hidden className="size-4 shrink-0" />
      <span
        lang={other.locale}
        dir={other.locale === "ar" ? "rtl" : "ltr"}
        className="site-language-label"
      >
        {full ? words.name : words.short}
      </span>
    </>
  );
  const shared = {
    lang: other.locale,
    className: cn("site-tool", full && "site-tool-wide", className),
    title: words.name,
  } as const;
  return context.editing ? (
    <span {...shared}>{body}</span>
  ) : (
    <a
      {...shared}
      href={other.href}
      hrefLang={other.locale}
      aria-label={full ? undefined : words.name}
    >
      {body}
    </a>
  );
}

/**
 * Light or dark, beside the language. The page follows the reader's
 * device until they choose; their choice is kept as the app keeps it.
 */
function ThemeSwitch({
  context,
  className,
}: {
  context: RenderContext;
  className?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  // The reader's choice is known only in the browser; until then the icons
  // follow the page's class and the button claims no state.
  const mounted = useHydrated();
  const t = { locale: context.locale };
  const icons = (
    <>
      <Moon aria-hidden className="size-[1.125rem] dark:hidden" />
      <Sun aria-hidden className="hidden size-[1.125rem] dark:block" />
    </>
  );
  if (context.editing)
    return (
      <span aria-hidden className={cn("site-tool site-tool-icon", className)}>
        {icons}
      </span>
    );
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      className={cn("site-tool site-tool-icon", className)}
      aria-label={m.siteDarkMode({}, t)}
      aria-pressed={mounted ? dark : undefined}
      title={m.siteDarkMode({}, t)}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {icons}
    </button>
  );
}

/** The language and the light or dark choice, the header's tools. */
function Tools({ frame, context }: FrameProps) {
  return (
    <div className="site-tools @max-3xl/site:hidden">
      <LanguageSwitch frame={frame} context={context} />
      <ThemeSwitch context={context} />
    </div>
  );
}

/**
 * The header's actions: the quieter ones said in words while there is room,
 * then the one filled button.
 */
function BarActions({ frame, context }: FrameProps) {
  const primary = primaryAction(frame);
  const quiet = quietActions(frame);
  if (!primary && quiet.length === 0) return null;
  return (
    <div className="flex items-center gap-1 @max-3xl/site:hidden">
      {quiet.map((action) => (
        <SiteAnchor
          key={action.id}
          href={action.href}
          context={context}
          className="site-navlink @max-7xl/site:hidden"
        >
          {action.label}
        </SiteAnchor>
      ))}
      {primary ? (
        <SiteAnchor
          href={primary.href}
          context={context}
          className="site-button ms-2"
          size="sm"
        >
          {primary.label}
        </SiteAnchor>
      ) : null}
    </div>
  );
}

function DesktopNav({
  frame,
  context,
  className,
}: FrameProps & { className?: string }) {
  const t = { locale: context.locale };
  return (
    <nav aria-label={m.siteNavigation({}, t)} className={className}>
      <ul className="flex items-center justify-center">
        {navEntries(frame).map((entry) => {
          const below = childrenOf(frame, entry);
          return (
            <li key={entry.id} className="group relative">
              <SiteAnchor
                href={entry.href}
                context={context}
                current={entry.href === frame.currentHref}
                className="site-navlink"
              >
                {entry.label}
                {below.length ? (
                  <ChevronDown
                    aria-hidden
                    className="size-3.5 opacity-60 transition-transform duration-200 group-focus-within:rotate-180 group-hover:rotate-180"
                  />
                ) : null}
              </SiteAnchor>
              {below.length ? (
                <div className="invisible absolute start-1/2 top-full z-30 -translate-x-1/2 pt-2 opacity-0 transition duration-200 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 rtl:translate-x-1/2">
                  <ul
                    className="site-section grid min-w-64 gap-0.5 rounded-[var(--s-radius-sm)] p-2 text-start shadow-[var(--s-shadow-lift)] ring-1 ring-[var(--s-border)]"
                    style={schemeStyle(context.theme, "canvas")}
                  >
                    {below.map((item) => (
                      <li key={item.id}>
                        <SiteAnchor
                          href={item.href}
                          context={context}
                          current={item.href === frame.currentHref}
                          className="block rounded-[var(--s-radius-sm)] px-3 py-2.5 text-[0.9375rem] transition-colors hover:bg-[color-mix(in_oklab,var(--s-fg)_7%,transparent)] aria-[current=page]:text-[var(--s-link)]"
                        >
                          {item.label}
                        </SiteAnchor>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MenuButton({
  open,
  onToggle,
  context,
  className,
  labelled = false,
}: {
  open: boolean;
  onToggle: () => void;
  context: RenderContext;
  className?: string;
  /** Whether the word "Menu" shows beside the icon. */
  labelled?: boolean;
}) {
  const t = { locale: context.locale };
  const Glyph = open ? X : Menu;
  const label = open ? m.siteCloseMenu({}, t) : m.siteMenu({}, t);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={labelled ? undefined : label}
      className={cn(
        "site-tool",
        labelled ? "site-tool-wide" : "site-tool-icon",
        className,
      )}
    >
      <Glyph aria-hidden className="size-5" />
      {labelled ? <span>{label}</span> : null}
    </button>
  );
}

/**
 * The menu opened from the menu button: every page large, each with the
 * pages under it, and beside them what the bar above cannot show at this
 * width, so nothing appears twice on the screen.
 */
function MenuPanel({
  frame,
  context,
  onClose,
}: FrameProps & { onClose: () => void }) {
  const t = { locale: context.locale };
  const top = topLevel(frame);
  const utility = utilityLinks(frame);
  const quiet = quietActions(frame);
  const primary = primaryAction(frame);
  useEffect(() => {
    if (context.editing) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [context.editing, onClose]);
  return (
    <div
      className="site-section site-menu-panel"
      style={schemeStyle(context.theme, "canvas")}
    >
      <nav
        aria-label={m.siteNavigation({}, t)}
        className="site-container grid gap-10 py-8 @3xl/site:py-14 @5xl/site:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] @5xl/site:gap-16"
      >
        <ul className="grid content-start gap-x-10 @3xl/site:grid-cols-2 @3xl/site:gap-y-7">
          {top.map((entry) => {
            const below = childrenOf(frame, entry);
            return (
              <li
                key={entry.id}
                className="border-b border-[var(--s-border)] @3xl/site:border-0"
              >
                <SiteAnchor
                  href={entry.href}
                  context={context}
                  current={entry.href === frame.currentHref}
                  className="site-menu-link"
                >
                  {entry.label}
                  <ArrowRight
                    aria-hidden
                    className="site-arrow size-5 opacity-40 rtl:-scale-x-100"
                  />
                </SiteAnchor>
                {below.length ? (
                  <ul className="grid gap-0.5 pb-4 @3xl/site:mt-2 @3xl/site:pb-0">
                    {below.map((item) => (
                      <li key={item.id}>
                        <SiteAnchor
                          href={item.href}
                          context={context}
                          current={item.href === frame.currentHref}
                          className="site-muted block py-1.5 transition-colors hover:text-[var(--s-fg)] aria-[current=page]:text-[var(--s-link)]"
                        >
                          {item.label}
                        </SiteAnchor>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="grid content-start gap-8 @5xl/site:border-s @5xl/site:border-[var(--s-border)] @5xl/site:ps-12">
          {quiet.length || primary ? (
            <div className="grid gap-3">
              {quiet.map((action) => (
                <SiteAnchor
                  key={action.id}
                  href={action.href}
                  context={context}
                  className="site-button justify-between"
                  variant="secondary"
                >
                  {action.label}
                  <ArrowRight aria-hidden className="rtl:-scale-x-100" />
                </SiteAnchor>
              ))}
              {primary ? (
                <SiteAnchor
                  href={primary.href}
                  context={context}
                  className="site-button justify-between"
                >
                  {primary.label}
                  <ArrowRight aria-hidden className="rtl:-scale-x-100" />
                </SiteAnchor>
              ) : null}
            </div>
          ) : null}
          {utility.length ? (
            <ul className="grid gap-1">
              {utility.map((item) => (
                <li key={item.id}>
                  <SiteAnchor
                    href={item.href}
                    context={context}
                    className="site-muted block py-1.5 transition-colors hover:text-[var(--s-fg)]"
                  >
                    {item.label}
                  </SiteAnchor>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="site-small hidden @5xl/site:block">
            <ContactList context={context} />
          </div>
          <div className="flex flex-wrap items-center gap-2 @3xl/site:hidden">
            <LanguageSwitch frame={frame} context={context} full />
            <ThemeSwitch context={context} />
          </div>
        </div>
      </nav>
    </div>
  );
}

type Pin = "top" | "shown" | "hidden";

/**
 * Where the header stands as the page scrolls: at rest near the top,
 * tucked away while a visitor reads on down, back as soon as they scroll up.
 */
function usePin(enabled: boolean): Pin {
  const [pin, setPin] = useState<Pin>("top");
  useEffect(() => {
    if (!enabled) return undefined;
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const next: Pin | null =
        y < 120
          ? "top"
          : y > last + 6 && y > 320
            ? "hidden"
            : y < last - 6
              ? "shown"
              : null;
      if (next) setPin(next);
      last = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled]);
  return pin;
}

/**
 * The one header of every page, always a single row, in the theme's
 * arrangement: classic (the name, the pages, the tools and the action),
 * centred (the menu, the name in the middle, the tools and the action),
 * overlay (classic, laid over the opening picture until the page scrolls)
 * or minimal (the name, the tools, the action and the menu). The menu
 * button stays on a wide screen whenever the menu holds what the row
 * cannot: the pages of a centred or minimal header, or the school's own
 * links.
 */
function Header({
  frame,
  context,
  overlay,
}: FrameProps & { overlay: boolean }) {
  const [open, setOpen] = useState(false);
  const pin = usePin(!context.editing);
  const style = context.theme.header;
  const inline = style === "classic" || style === "overlay";
  const fits = navFits(frame);
  const toggle = () => setOpen((value) => !value);
  const close = () => setOpen(false);
  const transparent = style === "overlay" && overlay && pin === "top" && !open;
  const menuAlways = !inline || utilityLinks(frame).length > 0;
  const menu = (labelled: boolean, className?: string) => (
    <MenuButton
      open={open}
      onToggle={toggle}
      context={context}
      labelled={labelled}
      className={className}
    />
  );
  const tools = (
    <>
      <Tools frame={frame} context={context} />
      <span aria-hidden className="site-tool-divider @max-3xl/site:hidden" />
      <BarActions frame={frame} context={context} />
    </>
  );
  return (
    <header
      className="site-section site-header"
      data-overlay={style === "overlay" && overlay ? "" : undefined}
      data-transparent={transparent ? "" : undefined}
      data-hidden={pin === "hidden" && !open ? "" : undefined}
      data-raised={pin === "shown" || open ? "" : undefined}
      style={{
        ...schemeStyle(context.theme, "canvas"),
        ...(transparent ? overMediaStyle : {}),
      }}
    >
      {style === "centered" ? (
        <div className="site-container site-bar flex justify-between gap-4 @3xl/site:grid @3xl/site:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-center @max-3xl/site:hidden">
            {menu(true)}
          </div>
          <Brand frame={frame} context={context} />
          <div className="flex items-center justify-end gap-2">
            {tools}
            {menu(false, "@3xl/site:hidden")}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "site-container site-bar",
            inline
              ? "grid grid-cols-[auto_1fr_auto] gap-6"
              : "flex justify-between gap-4",
          )}
        >
          <Brand frame={frame} context={context} />
          {inline ? (
            <DesktopNav frame={frame} context={context} className={fits.show} />
          ) : null}
          <div className="flex items-center justify-end gap-2">
            {tools}
            {menu(!inline, menuAlways ? undefined : fits.menu)}
          </div>
        </div>
      )}
      {open ? (
        <MenuPanel frame={frame} context={context} onClose={close} />
      ) : null}
    </header>
  );
}

function Socials({ frame }: { frame: SiteFrameModel }) {
  if (frame.socialLinks.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {frame.socialLinks.map((link) => {
        const social = SOCIAL[link.kind];
        const Glyph = social.icon;
        return (
          <li key={link.url}>
            <a
              href={link.url}
              rel="noopener noreferrer"
              aria-label={social.name}
              title={social.name}
              className="site-icon-button"
            >
              <Glyph aria-hidden stroke={1.75} />
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function FooterColumns({
  context,
  columns,
}: {
  context: RenderContext;
  columns: ReturnType<typeof footerColumns>;
}) {
  return (
    <>
      {columns.map((column) => (
        <div key={column.id} className="grid content-start gap-4">
          <h2 className="site-footer-title">{column.title}</h2>
          <ul className="grid gap-2.5">
            {column.links.map((link) => (
              <li key={link.id}>
                <SiteAnchor
                  href={link.href}
                  context={context}
                  className="site-footer-link"
                >
                  {link.label}
                </SiteAnchor>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function FooterBase({ frame, context }: FrameProps) {
  const t = { locale: context.locale };
  const year = context.today
    ? new Intl.NumberFormat(numberLocale(context.locale), {
        useGrouping: false,
      }).format(Number(context.today.slice(0, 4)))
    : null;
  return (
    <div className="border-t border-[var(--s-border)]">
      <div className="site-container flex flex-wrap items-center gap-x-6 gap-y-3 py-6 text-[0.8125rem]">
        <p className="site-muted me-auto">
          {year
            ? m.siteCopyright({ year, name: frame.name }, t)
            : m.siteCopyrightName({ name: frame.name }, t)}
          {frame.footerNote ? (
            <span className="ms-3 border-s border-[var(--s-border)] ps-3">
              {frame.footerNote}
            </span>
          ) : null}
        </p>
        {context.editing ? (
          <span className="font-medium">{m.sitePortalSignIn({}, t)}</span>
        ) : (
          <a href={frame.signInHref} className="font-medium hover:underline">
            {m.sitePortalSignIn({}, t)}
          </a>
        )}
        <LanguageSwitch frame={frame} context={context} full />
      </div>
    </div>
  );
}

function Footer({ frame, context }: FrameProps) {
  const t = { locale: context.locale };
  const style = context.theme.footer;
  const columns = footerColumns(frame, m.siteNavigation({}, t));
  const about = (
    <div className="grid content-start gap-6">
      <Brand frame={frame} context={context} />
      <div className="site-small">
        <ContactList context={context} />
      </div>
      <Socials frame={frame} />
    </div>
  );
  if (style === "compact")
    return (
      <footer
        className="site-section border-t border-[var(--s-border)]"
        style={schemeStyle(context.theme, "soft")}
      >
        <div className="site-container flex flex-wrap items-center gap-x-10 gap-y-6 py-10">
          <Brand frame={frame} context={context} />
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {columns
              .flatMap((column) => column.links)
              .map((link) => (
                <li key={link.id}>
                  <SiteAnchor
                    href={link.href}
                    context={context}
                    className="site-footer-link"
                  >
                    {link.label}
                  </SiteAnchor>
                </li>
              ))}
          </ul>
          <div className="ms-auto">
            <Socials frame={frame} />
          </div>
        </div>
        <FooterBase frame={frame} context={context} />
      </footer>
    );
  const contact = style === "contact";
  return (
    <footer
      className="site-section border-t border-[var(--s-border)]"
      style={schemeStyle(context.theme, contact ? "brand" : "ink")}
    >
      {contact ? (
        <div className="site-container">
          <div className="flex flex-wrap items-end justify-between gap-8 border-b border-[var(--s-border)] py-16 @3xl/site:py-20">
            <p className="site-heading site-h2">{m.siteComeAndSee({}, t)}</p>
            {frame.actions.length ? (
              <div className="site-actions">
                {frame.actions.map((action) => (
                  <SiteAnchor
                    key={action.id}
                    href={action.href}
                    context={context}
                    className="site-button"
                    size="lg"
                    variant={
                      action.style === "secondary" ? "secondary" : undefined
                    }
                  >
                    {action.label}
                  </SiteAnchor>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        className="site-container grid gap-x-10 gap-y-12 py-16 @3xl/site:grid-cols-2 @3xl/site:py-20 @5xl/site:grid-cols-[minmax(0,1.6fr)_repeat(var(--columns),minmax(0,1fr))]"
        style={{ "--columns": columns.length } as CSSProperties}
      >
        {about}
        <FooterColumns context={context} columns={columns} />
      </div>
      <FooterBase frame={frame} context={context} />
    </footer>
  );
}

function Banner({ frame, context }: FrameProps) {
  if (!frame.banner) return null;
  const Icon = BANNER_ICON[frame.banner.tone];
  const info = frame.banner.tone === "info";
  return (
    <div
      className={cn(
        "text-[0.875rem] font-medium",
        info && "site-section",
        frame.banner.tone === "warning" && "bg-[#FFE08A] text-[#3D2E00]",
        frame.banner.tone === "danger" && "bg-[#B42318] text-white",
      )}
      style={info ? schemeStyle(context.theme, "brand") : undefined}
    >
      <p className="site-container flex min-h-10 items-center justify-center gap-2 py-2 text-center">
        <Icon aria-hidden className="size-4 shrink-0" />
        {frame.banner.text}
      </p>
    </div>
  );
}

/** Up to three actions a phone keeps within reach at the bottom of every page. */
function Dock({ frame, context }: FrameProps) {
  if (!frame.dock || frame.actions.length === 0) return null;
  return (
    <div
      className="site-section sticky bottom-0 z-30 border-t border-[var(--s-border)] @3xl/site:hidden"
      style={schemeStyle(context.theme, "canvas")}
    >
      <div className="grid auto-cols-fr grid-flow-col gap-2 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        {frame.actions.map((action) => (
          <SiteAnchor
            key={action.id}
            href={action.href}
            context={context}
            className="site-button px-2"
            size="sm"
            variant={action.style === "secondary" ? "secondary" : undefined}
          >
            {action.label}
          </SiteAnchor>
        ))}
      </div>
    </div>
  );
}

/**
 * A school's site around its page: banner, header, footer and the phone
 * dock, drawn by the theme's header and footer styles. The same frame runs
 * the public site and the builder's canvas.
 */
export function SiteFrame({
  frame,
  context,
  overlay,
  bare = false,
  children,
}: {
  frame: SiteFrameModel;
  context: RenderContext;
  /** The page opens on a full-bleed picture the overlay header can sit on. */
  overlay: boolean;
  /** The page is whole in itself, as a door laid out as a page is: no header, footer or banner. */
  bare?: boolean;
  children: ReactNode;
}) {
  const t = { locale: context.locale };
  const root = useRef<HTMLDivElement>(null);
  const duotone = duotoneTables(context.theme);
  useReveal(root, context.editing ? "none" : context.theme.motion);
  return (
    <div
      ref={root}
      lang={context.locale}
      dir={context.locale === "ar" ? "rtl" : "ltr"}
      className="site-root relative flex min-h-full flex-col"
      {...themeAttributes(context.theme, context.editing)}
      style={{
        ...themeStyle(context.theme, context.locale),
        ...schemeStyle(context.theme, "canvas"),
      }}
    >
      {context.editing ? null : (
        <a
          href="#site-main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-black focus:px-3 focus:py-2 focus:text-white"
        >
          {m.siteSkipToContent({}, t)}
        </a>
      )}
      <svg aria-hidden className="absolute size-0">
        <filter id="site-duotone" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"
          />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={duotone[0]} />
            <feFuncG type="table" tableValues={duotone[1]} />
            <feFuncB type="table" tableValues={duotone[2]} />
          </feComponentTransfer>
        </filter>
      </svg>
      {bare ? null : <Banner frame={frame} context={context} />}
      {bare ? null : (
        <Header frame={frame} context={context} overlay={overlay} />
      )}
      <main id="site-main" className="flex-1 overflow-x-clip">
        {children}
      </main>
      {bare ? null : (
        <>
          <Footer frame={frame} context={context} />
          <Dock frame={frame} context={context} />
        </>
      )}
    </div>
  );
}
