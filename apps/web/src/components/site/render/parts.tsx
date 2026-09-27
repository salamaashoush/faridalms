import type { ContentDocument } from "@faridalms/domain/content";
import type {
  IconId,
  PageSection,
  SiteImage,
  SiteLink as Link,
  SiteLocale,
  SiteMedia,
} from "@faridalms/domain/site-sections";
import type { Divider, Theme } from "@faridalms/domain/site-theme";
import type { LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import {
  Award,
  BookOpen,
  Bus,
  CalendarDays,
  Clock,
  Compass,
  FlaskConical,
  Globe,
  GraduationCap,
  Heart,
  ImageIcon,
  Leaf,
  Lightbulb,
  Mail,
  Map,
  Music,
  Palette,
  Pause,
  Phone,
  Play,
  Shield,
  Sparkles,
  Star,
  Trophy,
  Users,
  Utensils,
} from "lucide-react";
import { useRef, useState } from "react";

import { ContentView } from "~/components/content/ContentView";
import { cn } from "~/utils/cn";

import { SiteArt } from "./art";
import { overMediaStyle, schemeStyle } from "./theme";

export interface NewsItem {
  postId: string;
  slug: string;
  title: string;
  excerpt: string;
  coverKey: string | null;
  coverAlt: string;
  publishedAt: string;
}

export interface SiteContact {
  address: { lines?: string[]; city?: string; country?: string } | null;
  phone: string | null;
  email: string | null;
}

export interface RenderContext {
  school: string;
  locale: SiteLocale;
  theme: Theme;
  /** Where a file the page shows is served from, or null when it cannot be. */
  fileUrl: (fileId: string) => string | null;
  news: NewsItem[];
  contact: SiteContact | null;
  /** The page's address inside the site, "" for the home page; forms send it with a message. */
  page?: string;
  /** Carried by every link inside the site, such as the language when it is not the site's first. */
  query?: string;
  /** In the builder: links do not navigate and missing pictures show where they go. */
  editing?: boolean;
}

export const publicMediaUrl = (key: string) => `/public-media/${key}`;

/** A day in the site's language, which may differ from the reader's own setting. */
export function siteDate(iso: string, locale: SiteLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso));
}

/** A link a page author wrote: a path inside the site lands under the school's address. */
export function siteHref(school: string, href: string, query = ""): string {
  if (!href.startsWith("/")) return href;
  const [path = "", hash] = href.split("#");
  const base = `/site/${school}${path === "/" ? "" : path}`;
  return `${base || "/"}${query}${hash === undefined ? "" : `#${hash}`}`;
}

const ICON: Record<Exclude<IconId, "none">, LucideIcon> = {
  book: BookOpen,
  graduation: GraduationCap,
  users: Users,
  globe: Globe,
  trophy: Trophy,
  palette: Palette,
  music: Music,
  flask: FlaskConical,
  heart: Heart,
  leaf: Leaf,
  star: Star,
  calendar: CalendarDays,
  map: Map,
  phone: Phone,
  mail: Mail,
  shield: Shield,
  lightbulb: Lightbulb,
  bus: Bus,
  utensils: Utensils,
  award: Award,
  compass: Compass,
  sparkles: Sparkles,
  clock: Clock,
};

export function SiteIcon({
  icon,
  className,
}: {
  icon: IconId;
  className?: string;
}) {
  if (icon === "none") return null;
  const Icon = ICON[icon];
  return <Icon aria-hidden className={className} />;
}

export function iconOf(icon: IconId): LucideIcon | null {
  return icon === "none" ? null : ICON[icon];
}

export function SiteAnchor({
  href,
  context,
  className,
  children,
  style,
  variant,
}: {
  href: string;
  context: RenderContext;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
  variant?: "secondary";
}) {
  if (context.editing || !href)
    return (
      <span className={className} style={style} data-variant={variant}>
        {children}
      </span>
    );
  const target = siteHref(context.school, href, context.query);
  return (
    <a
      href={target}
      className={className}
      style={style}
      data-variant={variant}
      rel={target.startsWith("/") ? undefined : "noopener noreferrer"}
    >
      {children}
    </a>
  );
}

export function Actions({
  actions,
  context,
  className,
}: {
  actions: Link[];
  context: RenderContext;
  className?: string;
}) {
  const shown = actions.filter((action) => action.label.trim());
  if (shown.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-3", className)}>
      {shown.map((action, index) => (
        <SiteAnchor
          key={action.id}
          href={action.href}
          context={context}
          className="site-button"
          variant={index === 0 ? undefined : "secondary"}
        >
          {action.label}
        </SiteAnchor>
      ))}
    </div>
  );
}

export function Eyebrow({ children }: { children: string }) {
  return children ? <p className="site-eyebrow">{children}</p> : null;
}

/** Words a school wraps in asterisks, set in the theme's second voice. */
export function Emphasised({ children }: { children: string }) {
  const parts = children.split(/(\*[^*\n]+\*)/);
  if (parts.length === 1) return children;
  let offset = 0;
  return parts.map((part) => {
    const at = offset;
    offset += part.length;
    return part.length > 2 && part.startsWith("*") && part.endsWith("*") ? (
      <em key={at} className="site-em">
        {part.slice(1, -1)}
      </em>
    ) : (
      part
    );
  });
}

const SIZE = { display: "site-display", h2: "site-h2", h3: "site-h3" } as const;

export function Heading({
  children,
  level = 2,
  size,
  className,
}: {
  children: string;
  level?: 1 | 2 | 3;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  if (!children) return null;
  const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  return (
    <Tag
      className={cn(
        "site-heading",
        SIZE[size ?? (level === 1 ? "display" : level === 2 ? "h2" : "h3")],
        className,
      )}
    >
      <Emphasised>{children}</Emphasised>
    </Tag>
  );
}

export function Lead({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return children ? (
    <p
      className={cn(
        "site-muted text-lg leading-[1.6] whitespace-pre-line",
        className,
      )}
    >
      {children}
    </p>
  ) : null;
}

export function Prose({
  body,
  context,
}: {
  body: ContentDocument;
  context: RenderContext;
}) {
  return (
    <div className="site-prose">
      <ContentView
        document={body}
        fileUrl={(fileId) => context.fileUrl(fileId) ?? ""}
      />
    </div>
  );
}

/**
 * A picture, or where none is chosen yet, artwork in the theme's colours.
 * A feature picture takes the theme's image shape.
 */
export function Picture({
  image,
  context,
  className,
  ratio,
  seed = "",
  feature = false,
  art = true,
}: {
  image: SiteImage;
  context: RenderContext;
  className?: string;
  ratio?: string;
  seed?: string;
  feature?: boolean;
  art?: boolean;
}) {
  const src = image.fileId ? context.fileUrl(image.fileId) : null;
  const body = src ? (
    <img
      src={src}
      alt={image.alt}
      loading="lazy"
      className={cn("site-media", className)}
      style={{ aspectRatio: ratio }}
    />
  ) : art ? (
    <SiteArt
      seed={seed || ratio || "picture"}
      className={className}
      ratio={ratio}
    />
  ) : context.editing ? (
    <div
      aria-hidden
      className={cn(
        "grid place-items-center rounded-[var(--s-radius)] bg-[color-mix(in_srgb,var(--s-fg)_8%,transparent)]",
        className,
      )}
      style={{ aspectRatio: ratio }}
    >
      <ImageIcon className="size-8 opacity-40" />
    </div>
  ) : null;
  return feature && body ? <div className="site-feature">{body}</div> : body;
}

/**
 * A picture or a video. A video plays only when asked, with its captions;
 * an autoplaying background is decorative and always has a pause button.
 */
export function MediaView({
  media,
  context,
  className,
  ratio,
  seed,
  feature = false,
}: {
  media: SiteMedia;
  context: RenderContext;
  className?: string;
  ratio?: string;
  seed?: string;
  feature?: boolean;
}) {
  if (media.kind === "image")
    return (
      <Picture
        image={media}
        context={context}
        className={className}
        ratio={ratio}
        seed={seed}
        feature={feature}
      />
    );
  const src = media.fileId ? context.fileUrl(media.fileId) : null;
  if (!src)
    return (
      <Picture
        image={{ fileId: null, alt: "" }}
        context={context}
        className={className}
        ratio={ratio}
        seed={seed}
        feature={feature}
      />
    );
  const poster = media.posterFileId
    ? (context.fileUrl(media.posterFileId) ?? undefined)
    : undefined;
  const captions = media.captionsFileId
    ? context.fileUrl(media.captionsFileId)
    : null;
  return captions ? (
    <video
      controls
      preload="metadata"
      poster={poster}
      className={cn("site-media bg-black", className)}
      style={{ aspectRatio: ratio ?? "16 / 9" }}
    >
      <source src={src} type="video/mp4" />
      <track kind="captions" src={captions} srcLang={context.locale} default />
    </video>
  ) : null;
}

/** A decorative, muted background film, paused on request and for reduced motion. */
export function BackgroundVideo({
  src,
  poster,
  pauseLabel,
  playLabel,
}: {
  src: string;
  poster?: string;
  pauseLabel: string;
  playLabel: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  return (
    <>
      <video
        ref={video}
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden
        className="absolute inset-0 size-full object-cover motion-reduce:hidden"
      />
      <button
        type="button"
        onClick={() => {
          const element = video.current;
          if (!element) return;
          if (element.paused) void element.play();
          else element.pause();
          setPlaying(!element.paused);
        }}
        className="absolute end-4 bottom-4 z-10 grid size-10 place-items-center rounded-full bg-black/55 text-white motion-reduce:hidden"
        aria-label={playing ? pauseLabel : playLabel}
      >
        {playing ? (
          <Pause aria-hidden className="size-4" />
        ) : (
          <Play aria-hidden className="size-4" />
        )}
      </button>
    </>
  );
}

const SPACING = { s: 0.6, m: 1, l: 1.45 } as const;
const WIDTH = { contained: "72rem", wide: "84rem", full: "none" } as const;

function DividerShape({
  divider,
  edge,
}: {
  divider: Divider;
  edge: "top" | "bottom";
}) {
  if (divider === "none") return null;
  const paths: Record<Exclude<Divider, "none">, string> = {
    curve: "M0,40 C360,0 1080,0 1440,40 L1440,40 L0,40 Z",
    wave: "M0,24 C240,48 480,0 720,24 C960,48 1200,0 1440,24 L1440,40 L0,40 Z",
    angle: "M0,40 L1440,0 L1440,40 Z",
  };
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 40"
      preserveAspectRatio="none"
      className={cn(
        "pointer-events-none absolute inset-x-0 h-6 w-full @3xl/site:h-10",
        edge === "top" ? "bottom-full" : "top-full rotate-180",
      )}
      style={{ fill: "var(--s-bg)" }}
    >
      <path d={paths[divider]} />
    </svg>
  );
}

/**
 * The frame every section sits in: its colour scheme or background media,
 * its spacing, width and alignment, its dividers and its anchor.
 */
export function SectionFrame({
  section,
  context,
  children,
  full = false,
  padded = true,
  joined = false,
  labels,
}: {
  section: PageSection;
  context: RenderContext;
  children: ReactNode;
  /** The section fills the width whatever its width setting says. */
  full?: boolean;
  padded?: boolean;
  /** It continues the section above on the same colour, so the two share one gap. */
  joined?: boolean;
  labels: { pause: string; play: string };
}) {
  const style = section.style;
  const background = style.background;
  const backgroundSrc =
    background.kind !== "none" && background.fileId
      ? context.fileUrl(background.fileId)
      : null;
  const poster = background.posterFileId
    ? (context.fileUrl(background.posterFileId) ?? undefined)
    : undefined;
  const overMedia = Boolean(backgroundSrc);
  return (
    <section
      id={style.anchor || undefined}
      className={cn(
        "site-section relative",
        style.align === "center" && "text-center",
      )}
      style={{
        ...schemeStyle(context.theme, style.scheme),
        ...(overMedia ? overMediaStyle : {}),
      }}
    >
      {backgroundSrc ? (
        <div
          aria-hidden={background.kind === "image"}
          className="absolute inset-0 overflow-hidden"
        >
          {background.kind === "image" ? (
            <img
              src={backgroundSrc}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <BackgroundVideo
              src={backgroundSrc}
              poster={poster}
              pauseLabel={labels.pause}
              playLabel={labels.play}
            />
          )}
          <div
            className="absolute inset-0 bg-black"
            style={{ opacity: background.overlay / 100 }}
          />
        </div>
      ) : null}
      <DividerShape divider={style.dividerTop} edge="top" />
      <div
        data-reveal
        className={cn(
          "relative mx-auto w-full",
          !full && "px-5 @3xl/site:px-8",
        )}
        style={{
          maxWidth: full ? "none" : WIDTH[style.width],
          paddingBlockStart: padded
            ? `calc(var(--s-space) * ${SPACING[style.spacing] * (joined ? 0.3 : 1)})`
            : undefined,
          paddingBlockEnd: padded
            ? `calc(var(--s-space) * ${SPACING[style.spacing]})`
            : undefined,
        }}
      >
        {children}
      </div>
      <DividerShape divider={style.dividerBottom} edge="bottom" />
    </section>
  );
}

export function SectionIntro({
  eyebrow = "",
  heading,
  text = "",
  center,
}: {
  eyebrow?: string;
  heading: string;
  text?: string;
  center?: boolean;
}) {
  if (!eyebrow && !heading && !text) return null;
  return (
    <div
      className={cn(
        "mb-10 grid max-w-3xl gap-3",
        center && "mx-auto justify-items-center text-center",
      )}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <Heading>{heading}</Heading>
      <Lead>{text}</Lead>
    </div>
  );
}
