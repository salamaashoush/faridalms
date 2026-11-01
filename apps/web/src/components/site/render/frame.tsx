import type { SiteLocale, SocialKind } from "@faridalms/domain/website";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import {
  ChevronDown,
  ChevronRight,
  Info,
  Menu,
  OctagonAlert,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import * as m from "~/i18n/messages";

import type { RenderContext } from "./parts";

import { useReveal } from "./motion";
import { SiteAnchor } from "./parts";
import { ContactList } from "./sections";
import {
  duotoneTables,
  schemeStyle,
  themeAttributes,
  themeStyle,
} from "./theme";

export interface FrameLink {
  id: string;
  label: string;
  href: string;
}

export interface FrameMenuEntry extends FrameLink {
  parentId: string | null;
}

/** Everything the frame around a page shows, already in the language shown. */
export interface SiteFrameModel {
  name: string;
  tagline: string;
  logoUrl: string | null;
  banner: { text: string; tone: "info" | "warning" | "danger" } | null;
  utility: FrameLink[];
  actions: (FrameLink & { style: "primary" | "secondary" })[];
  menu: FrameMenuEntry[];
  footerColumns: { id: string; title: string; links: FrameLink[] }[];
  footerNote: string;
  dock: boolean;
  socialLinks: { kind: SocialKind; url: string }[];
  /** The other language's address of this page, when the site speaks two. */
  otherLanguage: { locale: SiteLocale; href: string } | null;
  currentHref: string;
  /** The school's portal sign-in, on the portal's own host. */
  signInHref: string;
  /** Where the name and logo lead; the website's home when unset. */
  homeHref?: string;
}

const SOCIAL_NAME: Record<SocialKind, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
};

const LANGUAGE_NAME: Record<SiteLocale, string> = {
  en: "English",
  ar: "العربية",
};

const BANNER_ICON = {
  info: Info,
  warning: TriangleAlert,
  danger: OctagonAlert,
} as const;

function Brand({
  frame,
  context,
  large = false,
}: {
  frame: SiteFrameModel;
  context: RenderContext;
  large?: boolean;
}) {
  return (
    <SiteAnchor
      href={frame.homeHref ?? "/"}
      context={context}
      className={cn(
        "flex min-w-0 shrink-0 items-center gap-3",
        large && "flex-col text-center",
      )}
    >
      {frame.logoUrl ? (
        <img
          src={frame.logoUrl}
          alt=""
          className={cn(
            "w-auto shrink-0 object-contain",
            large ? "h-16" : "h-10",
          )}
        />
      ) : null}
      <span className="grid min-w-0">
        <span
          className={cn(
            "site-heading leading-tight font-semibold whitespace-nowrap",
            large ? "text-2xl" : "text-lg",
          )}
        >
          {frame.name}
        </span>
        {frame.tagline ? (
          <span className="site-muted truncate text-xs">{frame.tagline}</span>
        ) : null}
      </span>
    </SiteAnchor>
  );
}

function LanguageLink({
  frame,
  context,
  className,
}: {
  frame: SiteFrameModel;
  context: RenderContext;
  className?: string;
}) {
  const other = frame.otherLanguage;
  if (!other) return null;
  const words = LANGUAGE_NAME[other.locale];
  return context.editing ? (
    <span lang={other.locale} className={className}>
      {words}
    </span>
  ) : (
    <a
      href={other.href}
      lang={other.locale}
      hrefLang={other.locale}
      className={className}
    >
      {words}
    </a>
  );
}

/** The frame's actions; beside a crowded menu only the filled ones stay until the screen is wide. */
function FrameActions({
  frame,
  context,
  className,
  compact = false,
}: {
  frame: SiteFrameModel;
  context: RenderContext;
  className?: string;
  compact?: boolean;
}) {
  if (frame.actions.length === 0) return null;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {frame.actions.map((action) => (
        <SiteAnchor
          key={action.id}
          href={action.href}
          context={context}
          className={cn(
            "site-button min-h-10 px-4 py-2 text-sm whitespace-nowrap",
            compact && action.style === "secondary" && "@max-7xl/site:hidden",
          )}
          variant={action.style === "secondary" ? "secondary" : undefined}
        >
          {action.label}
        </SiteAnchor>
      ))}
    </div>
  );
}

function UtilityBar({
  frame,
  context,
  withActions,
}: {
  frame: SiteFrameModel;
  context: RenderContext;
  withActions?: boolean;
}) {
  if (frame.utility.length === 0 && !frame.otherLanguage && !withActions)
    return null;
  return (
    <div
      className="site-section @max-4xl/site:hidden"
      style={schemeStyle(context.theme, "ink")}
    >
      <div className="mx-auto flex max-w-[84rem] items-center justify-end gap-5 px-8 py-2 text-sm">
        <ul className="flex flex-wrap items-center gap-5">
          {frame.utility.map((item) => (
            <li key={item.id}>
              <SiteAnchor
                href={item.href}
                context={context}
                className="opacity-85 hover:underline hover:opacity-100"
              >
                {item.label}
              </SiteAnchor>
            </li>
          ))}
        </ul>
        <LanguageLink
          frame={frame}
          context={context}
          className="font-medium hover:underline"
        />
        {withActions ? (
          <FrameActions frame={frame} context={context} className="ms-2" />
        ) : null}
      </div>
    </div>
  );
}

function DesktopNav({
  frame,
  context,
  centered,
}: {
  frame: SiteFrameModel;
  context: RenderContext;
  centered?: boolean;
}) {
  const t = { locale: context.locale };
  const top = frame.menu.filter((entry) => !entry.parentId);
  const below = (entry: FrameMenuEntry) =>
    frame.menu.filter((item) => item.parentId === entry.id);
  return (
    <nav aria-label={m.siteNavigation({}, t)} className="@max-5xl/site:hidden">
      <ul
        className={cn("flex items-center gap-1", centered && "justify-center")}
      >
        {top.map((entry) => {
          const children = below(entry);
          const current = entry.href === frame.currentHref;
          return (
            <li key={entry.id} className="group relative">
              <SiteAnchor
                href={entry.href}
                context={context}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1 rounded-[var(--s-radius)] px-2.5 text-[0.95rem] font-medium whitespace-nowrap hover:text-[var(--s-link)]",
                  current &&
                    "text-[var(--s-link)] underline decoration-2 underline-offset-8",
                )}
              >
                {entry.label}
                {children.length ? (
                  <ChevronDown aria-hidden className="size-4 opacity-60" />
                ) : null}
              </SiteAnchor>
              {children.length ? (
                <div className="invisible absolute start-0 top-full z-30 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  <ul
                    className="site-section grid min-w-60 gap-0.5 rounded-[var(--s-radius)] border border-[var(--s-border)] p-2 shadow-xl"
                    style={schemeStyle(context.theme, "canvas")}
                  >
                    {children.map((item) => (
                      <li key={item.id}>
                        <SiteAnchor
                          href={item.href}
                          context={context}
                          className="block rounded-[var(--s-radius)] px-3 py-2 text-sm hover:bg-[var(--s-card)]"
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

function MenuPanel({
  frame,
  context,
  onClose,
}: {
  frame: SiteFrameModel;
  context: RenderContext;
  onClose: () => void;
}) {
  const t = { locale: context.locale };
  const top = frame.menu.filter((entry) => !entry.parentId);
  return (
    <div
      className="site-section absolute inset-x-0 top-full z-40 border-t border-[var(--s-border)] shadow-2xl @max-3xl/site:h-[calc(100svh-4.5rem)] @max-3xl/site:overflow-y-auto"
      style={schemeStyle(context.theme, "canvas")}
    >
      <nav
        aria-label={m.siteNavigation({}, t)}
        className="mx-auto grid max-w-[84rem] gap-6 px-5 py-6 @3xl/site:px-8 @4xl/site:grid-cols-3"
      >
        <ul className="grid divide-y divide-[var(--s-border)] @4xl/site:col-span-2 @4xl/site:grid-cols-2 @4xl/site:gap-x-8 @4xl/site:divide-y-0">
          {top.map((entry) => {
            const children = frame.menu.filter(
              (item) => item.parentId === entry.id,
            );
            return (
              <li key={entry.id}>
                <SiteAnchor
                  href={entry.href}
                  context={context}
                  className={cn(
                    "site-heading flex min-h-14 items-center justify-between gap-4 py-2 text-xl font-semibold",
                    entry.href === frame.currentHref && "text-[var(--s-link)]",
                  )}
                >
                  {entry.label}
                  <ChevronRight
                    aria-hidden
                    className="size-5 opacity-40 rtl:-scale-x-100"
                  />
                </SiteAnchor>
                {children.length ? (
                  <ul className="mb-2 grid gap-0.5 border-s border-[var(--s-border)] ps-4">
                    {children.map((item) => (
                      <li key={item.id}>
                        <SiteAnchor
                          href={item.href}
                          context={context}
                          className="site-muted block py-1.5"
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
        <div className="grid content-start gap-4">
          {frame.utility.length ? (
            <ul className="grid gap-1">
              {frame.utility.map((item) => (
                <li key={item.id}>
                  <SiteAnchor
                    href={item.href}
                    context={context}
                    className="site-muted block py-1"
                  >
                    {item.label}
                  </SiteAnchor>
                </li>
              ))}
            </ul>
          ) : null}
          <LanguageLink
            frame={frame}
            context={context}
            className="font-semibold"
          />
          <FrameActions frame={frame} context={context} className="flex-wrap" />
        </div>
      </nav>
      <button
        type="button"
        onClick={onClose}
        className="sr-only focus:not-sr-only focus:m-2"
      >
        {m.siteCloseMenu({}, t)}
      </button>
    </div>
  );
}

function MenuButton({
  open,
  onToggle,
  context,
  always,
}: {
  open: boolean;
  onToggle: () => void;
  context: RenderContext;
  always?: boolean;
}) {
  const t = { locale: context.locale };
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-[var(--s-radius)] px-3 font-medium",
        !always && "@5xl/site:hidden",
      )}
    >
      {open ? (
        <X aria-hidden className="size-5" />
      ) : (
        <Menu aria-hidden className="size-5" />
      )}
      <span className={cn(!always && "sr-only")}>
        {open ? m.siteCloseMenu({}, t) : m.siteMenu({}, t)}
      </span>
    </button>
  );
}

type Pin = "top" | "shown" | "hidden";

/**
 * Where the pinned bar stands: out of the way near the top, shown as soon
 * as a visitor scrolls back up, hidden again while they read on down.
 */
function usePin(enabled: boolean): Pin {
  const [pin, setPin] = useState<Pin>("top");
  useEffect(() => {
    if (!enabled) return undefined;
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const next: Pin | null =
        y < 320
          ? "top"
          : y < last - 4
            ? "shown"
            : y > last + 4
              ? "hidden"
              : null;
      if (next) setPin(next);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [enabled]);
  return pin;
}

/**
 * A compact bar that slides down from the top when a visitor scrolls back
 * up, so the menu and the admissions actions are never a long scroll away.
 */
function PinnedBar({
  frame,
  context,
  pin,
}: {
  frame: SiteFrameModel;
  context: RenderContext;
  pin: Pin;
}) {
  const [open, setOpen] = useState(false);
  const shown = pin === "shown" || open;
  return (
    <div
      aria-hidden={!shown}
      inert={!shown}
      className={cn(
        "site-section fixed inset-x-0 top-0 z-40 border-b border-[var(--s-border)] shadow-[0_4px_20px_rgb(0_0_0/0.08)] transition-transform duration-[350ms] ease-[cubic-bezier(.165,.84,.44,1)] motion-reduce:transition-none",
        shown ? "translate-y-0" : "-translate-y-full",
      )}
      style={schemeStyle(context.theme, "canvas")}
    >
      <div className="mx-auto flex max-w-[84rem] items-center gap-4 px-5 py-2 @3xl/site:px-8">
        <Brand frame={frame} context={context} />
        <div className="ms-auto flex items-center gap-2">
          <DesktopNav frame={frame} context={context} />
          <FrameActions
            frame={frame}
            context={context}
            compact
            className="ms-2 @max-5xl/site:hidden"
          />
          <MenuButton
            open={open}
            onToggle={() => setOpen((value) => !value)}
            context={context}
          />
        </div>
      </div>
      {open ? (
        <MenuPanel
          frame={frame}
          context={context}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function Header(props: {
  frame: SiteFrameModel;
  context: RenderContext;
  overlay: boolean;
}) {
  const pin = usePin(!props.context.editing);
  return (
    <>
      <HeaderBar {...props} />
      {props.context.editing ? null : (
        <PinnedBar frame={props.frame} context={props.context} pin={pin} />
      )}
    </>
  );
}

function HeaderBar({
  frame,
  context,
  overlay,
}: {
  frame: SiteFrameModel;
  context: RenderContext;
  overlay: boolean;
}) {
  const [open, setOpen] = useState(false);
  const style = context.theme.header;
  const panel = open ? (
    <MenuPanel frame={frame} context={context} onClose={() => setOpen(false)} />
  ) : null;
  const toggle = () => setOpen((value) => !value);
  if (style === "centered")
    return (
      <header
        className="site-section relative z-30 border-b border-[var(--s-border)]"
        style={schemeStyle(context.theme, "canvas")}
      >
        <UtilityBar frame={frame} context={context} withActions />
        <div className="mx-auto grid max-w-[84rem] gap-4 px-5 py-4 @3xl/site:px-8 @4xl/site:justify-items-center @4xl/site:py-6">
          <div className="flex items-center justify-between gap-4 @4xl/site:justify-center">
            <Brand frame={frame} context={context} large />
            <MenuButton open={open} onToggle={toggle} context={context} />
          </div>
          <DesktopNav frame={frame} context={context} centered />
        </div>
        {panel}
      </header>
    );
  if (style === "minimal")
    return (
      <header
        className="site-section relative z-30"
        style={schemeStyle(context.theme, "canvas")}
      >
        <div className="mx-auto flex max-w-[84rem] items-center gap-4 px-5 py-4 @3xl/site:px-8">
          <Brand frame={frame} context={context} />
          <div className="ms-auto flex items-center gap-3">
            <LanguageLink
              frame={frame}
              context={context}
              className="font-medium @max-3xl/site:hidden"
            />
            <FrameActions
              frame={frame}
              context={context}
              className="@max-3xl/site:hidden"
            />
            <MenuButton
              open={open}
              onToggle={toggle}
              context={context}
              always
            />
          </div>
        </div>
        {panel}
      </header>
    );
  const transparent = style === "overlay" && overlay && !open;
  return (
    <header
      className={cn(
        "site-section z-30",
        transparent
          ? "absolute inset-x-0 top-0 bg-transparent"
          : "relative border-b border-[var(--s-border)]",
      )}
      style={{
        ...schemeStyle(context.theme, "canvas"),
        ...(transparent
          ? {
              "--s-bg": "transparent",
              "--s-fg": "#fff",
              "--s-heading": "#fff",
              "--s-muted": "rgba(255,255,255,.8)",
              "--s-link": "#fff",
              "--s-btn": "#fff",
              "--s-btn-fg": "#111",
            }
          : {}),
      }}
    >
      {transparent ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-black/55 to-transparent"
        />
      ) : (
        <UtilityBar frame={frame} context={context} />
      )}
      <div className="mx-auto flex max-w-[84rem] items-center gap-4 px-5 py-3 @3xl/site:px-8">
        <Brand frame={frame} context={context} />
        <div className="ms-auto flex items-center gap-2">
          <DesktopNav frame={frame} context={context} />
          {transparent ? (
            <LanguageLink
              frame={frame}
              context={context}
              className="px-2 font-medium @max-5xl/site:hidden"
            />
          ) : null}
          <FrameActions
            frame={frame}
            context={context}
            compact
            className="ms-2 @max-5xl/site:hidden"
          />
          <MenuButton open={open} onToggle={toggle} context={context} />
        </div>
      </div>
      {panel}
    </header>
  );
}

function Socials({ frame }: { frame: SiteFrameModel }) {
  if (frame.socialLinks.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {frame.socialLinks.map((link) => (
        <li key={link.url}>
          <a
            href={link.url}
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {SOCIAL_NAME[link.kind]}
          </a>
        </li>
      ))}
    </ul>
  );
}

function FooterBase({
  frame,
  context,
}: {
  frame: SiteFrameModel;
  context: RenderContext;
}) {
  const t = { locale: context.locale };
  return (
    <div className="border-t border-[var(--s-border)]">
      <div className="mx-auto flex max-w-[84rem] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-5 text-sm @3xl/site:px-8">
        {frame.footerNote ? (
          <p className="site-muted me-auto">{frame.footerNote}</p>
        ) : (
          <span className="me-auto" />
        )}
        <LanguageLink
          frame={frame}
          context={context}
          className="hover:underline"
        />
        {context.editing ? (
          <span>{m.sitePortalSignIn({}, t)}</span>
        ) : (
          <a href={frame.signInHref} className="hover:underline">
            {m.sitePortalSignIn({}, t)}
          </a>
        )}
      </div>
    </div>
  );
}

function Footer({
  frame,
  context,
}: {
  frame: SiteFrameModel;
  context: RenderContext;
}) {
  const t = { locale: context.locale };
  const style = context.theme.footer;
  const columns = frame.footerColumns.length
    ? frame.footerColumns
    : [
        {
          id: "menu",
          title: m.siteNavigation({}, t),
          links: frame.menu.filter((entry) => !entry.parentId),
        },
      ];
  if (style === "compact")
    return (
      <footer
        className="site-section"
        style={schemeStyle(context.theme, "soft")}
      >
        <div className="mx-auto flex max-w-[84rem] flex-wrap items-center gap-x-8 gap-y-4 px-5 py-8 @3xl/site:px-8">
          <Brand frame={frame} context={context} />
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {columns
              .flatMap((column) => column.links)
              .map((link) => (
                <li key={link.id}>
                  <SiteAnchor
                    href={link.href}
                    context={context}
                    className="hover:underline"
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
  if (style === "contact")
    return (
      <footer
        className="site-section"
        style={schemeStyle(context.theme, "brand")}
      >
        <div className="mx-auto grid max-w-[84rem] gap-10 px-5 py-14 @3xl/site:px-8 @4xl/site:grid-cols-[1.2fr_1fr]">
          <div className="grid content-start gap-5">
            <Brand frame={frame} context={context} />
            <p className="site-heading site-h2">{m.siteComeAndSee({}, t)}</p>
            <FrameActions
              frame={frame}
              context={context}
              className="flex-wrap"
            />
          </div>
          <div className="grid content-start gap-6">
            <ContactList context={context} />
            <Socials frame={frame} />
          </div>
        </div>
        <FooterBase frame={frame} context={context} />
      </footer>
    );
  return (
    <footer className="site-section" style={schemeStyle(context.theme, "ink")}>
      <div
        className="mx-auto grid max-w-[84rem] gap-10 px-5 py-14 @3xl/site:grid-cols-2 @3xl/site:px-8 @5xl/site:grid-cols-[1.4fr_repeat(var(--columns),minmax(0,1fr))]"
        style={{ "--columns": columns.length } as CSSProperties}
      >
        <div className="grid content-start gap-5">
          <Brand frame={frame} context={context} />
          <ContactList context={context} />
          <Socials frame={frame} />
        </div>
        {columns.map((column) => (
          <div key={column.id} className="grid content-start gap-3">
            <h2 className="text-sm font-semibold tracking-wide uppercase opacity-80">
              {column.title}
            </h2>
            <ul className="grid gap-2">
              {column.links.map((link) => (
                <li key={link.id}>
                  <SiteAnchor
                    href={link.href}
                    context={context}
                    className="hover:underline"
                  >
                    {link.label}
                  </SiteAnchor>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <FooterBase frame={frame} context={context} />
    </footer>
  );
}

function Banner({ frame }: { frame: SiteFrameModel }) {
  if (!frame.banner) return null;
  const Icon = BANNER_ICON[frame.banner.tone];
  return (
    <div
      className={cn(
        "px-5 py-2.5 text-sm font-medium",
        frame.banner.tone === "info" && "bg-[var(--s-primary)] text-white",
        frame.banner.tone === "warning" && "bg-[#FFE08A] text-[#3D2E00]",
        frame.banner.tone === "danger" && "bg-[#B42318] text-white",
      )}
    >
      <p className="mx-auto flex max-w-[84rem] items-center justify-center gap-2 text-center">
        <Icon aria-hidden className="size-4 shrink-0" />
        {frame.banner.text}
      </p>
    </div>
  );
}

/** Up to three actions a phone keeps within reach at the bottom of every page. */
function Dock({
  frame,
  context,
}: {
  frame: SiteFrameModel;
  context: RenderContext;
}) {
  if (!frame.dock || frame.actions.length === 0) return null;
  return (
    <div
      className="site-section sticky bottom-0 z-30 border-t border-[var(--s-border)] @4xl/site:hidden"
      style={schemeStyle(context.theme, "canvas")}
    >
      <div className="grid auto-cols-fr grid-flow-col gap-2 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {frame.actions.map((action, index) => (
          <SiteAnchor
            key={action.id}
            href={action.href}
            context={context}
            className="site-button min-h-11 justify-center px-2 py-2 text-sm"
            variant={
              index === frame.actions.length - 1 ? undefined : "secondary"
            }
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
      className="site-root relative flex min-h-full flex-col overflow-x-clip"
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
      {bare ? null : <Banner frame={frame} />}
      <div className="relative flex flex-1 flex-col">
        {bare ? null : (
          <Header frame={frame} context={context} overlay={overlay} />
        )}
        <main id="site-main" className="flex-1">
          {children}
        </main>
      </div>
      {bare ? null : (
        <>
          <Footer frame={frame} context={context} />
          <Dock frame={frame} context={context} />
        </>
      )}
    </div>
  );
}
