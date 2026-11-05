import type {
  IconId,
  PageSection,
  SectionOf,
  SiteBlock,
  SiteLocale,
  SiteMedia,
} from "@faridalms/domain/site-sections";
import type { CSSProperties, FormEvent, ReactNode } from "react";

import {
  answerLimit,
  optionsOf,
  questionComplete,
} from "@faridalms/domain/enquiries";
import { withoutEmphasis } from "@faridalms/domain/site-sections";
import { cn } from "@faridalms/ui/cn";
import { useHydrated } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Link2,
  Mail,
  MapPin,
  Megaphone,
  Pause,
  Phone,
  Play,
  Plus,
  Quote,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ContentView } from "~/components/content/ContentView";
import * as m from "~/i18n/messages";
import { submitSiteEnquiry } from "~/server/site";
import { formatDate, formatInstant, formatMonthShort } from "~/utils/datetime";
import { numberLocale } from "~/utils/digits";

import type { RenderContext, SiteIntake } from "./parts";

import { SiteArt } from "./art";
import { useCountUp } from "./motion";
import {
  Actions,
  BackgroundVideo,
  Eyebrow,
  Heading,
  Lead,
  MediaView,
  SitePicture,
  Prose,
  publicMediaUrl,
  Scrim,
  SectionFrame,
  fullBleed,
  SectionIntro,
  SiteAnchor,
  SiteIcon,
  TextLink,
} from "./parts";
import { focusStyle, overMediaStyle } from "./theme";
import { TurnstileWidget } from "./turnstile";

type Props<T extends PageSection["type"]> = {
  section: SectionOf<T>;
  context: RenderContext;
  first: boolean;
};

const BADGE_NAME: Record<string, string> = {
  isi: "ISI",
  khda: "KHDA",
  adek: "ADEK",
  ofsted: "Ofsted",
  bso: "BSO",
  cis: "CIS",
  neasc: "NEASC",
  ib: "IB",
  cognia: "Cognia",
};

const HEIGHT: Record<string, string> = {
  s: "min-h-[26rem] @3xl/site:min-h-[34rem]",
  m: "min-h-[30rem] @3xl/site:min-h-[40rem]",
  l: "min-h-[34rem] @3xl/site:min-h-[46rem]",
  screen: "min-h-[85svh] @3xl/site:min-h-[100svh]",
};

const Arrow = ({ className }: { className?: string }) => (
  <ArrowRight
    aria-hidden
    className={cn("site-arrow size-4 rtl:-scale-x-100", className)}
  />
);

/**
 * How many columns a row of items takes: the school's choice where it made
 * one, else as many as fill whole rows, so two news posts never leave a
 * third column standing empty.
 */
function columnsFor(count: number, max: 2 | 3 | 4 = 3): "2" | "3" | "4" {
  if (count <= 2 || max === 2) return "2";
  if (count <= max) return String(count) as "3" | "4";
  if (count % max === 0) return String(max) as "3" | "4";
  if (max === 4 && count % 3 === 0) return "3";
  if (count === 4) return "2";
  return String(max) as "3" | "4";
}

/** The quotation mark that opens a voice, mirrored for Arabic. */
const QuoteMark = ({ className }: { className?: string }) => (
  <Quote
    aria-hidden
    className={cn(
      "size-8 fill-current stroke-none text-[var(--s-link)] ltr:rotate-180 rtl:-scale-y-100",
      className,
    )}
  />
);

/** The picture, film or artwork a full-bleed opening sits on. */
function Backdrop({
  media,
  context,
  seed,
}: {
  media: SiteMedia;
  context: RenderContext;
  seed: string;
}) {
  const t = { locale: context.locale };
  const src = media.fileId ? context.fileUrl(media.fileId) : null;
  return (
    <div
      aria-hidden={media.kind === "image"}
      className="absolute inset-0 -z-10"
    >
      {media.kind === "video" && src ? (
        <BackgroundVideo
          src={src}
          poster={
            media.posterFileId
              ? (context.fileUrl(media.posterFileId) ?? undefined)
              : undefined
          }
          pauseLabel={m.sitePauseVideo({}, t)}
          playLabel={m.sitePlayVideo({}, t)}
        />
      ) : src ? (
        <img
          src={src}
          alt={media.alt}
          className="site-photo size-full object-cover"
          style={focusStyle(media.focus)}
        />
      ) : (
        <SiteArt seed={seed} kind="mesh" className="rounded-none" />
      )}
      <Scrim photo={Boolean(src)} strength="l" />
    </div>
  );
}

function Hero({ section, context, first }: Props<"hero">) {
  const { data, variant } = section;
  const words = (
    <div data-stagger className="site-stack">
      <Eyebrow field="eyebrow">{data.eyebrow}</Eyebrow>
      <Heading level={first ? 1 : 2} size="display" field="heading">
        {data.heading}
      </Heading>
      <Lead field="text">{data.text}</Lead>
      <Actions actions={data.actions} context={context} size="lg" />
    </div>
  );
  if (variant === "fullbleed")
    return (
      <div
        className={cn(
          "relative isolate flex items-end overflow-hidden",
          HEIGHT[data.height],
        )}
        style={overMediaStyle}
      >
        <Backdrop media={data.media} context={context} seed={section.id} />
        <div className="site-container pt-[calc(var(--s-space)*1.6)] pb-[var(--s-space)]">
          {words}
        </div>
      </div>
    );
  if (variant === "split")
    return (
      <div className="site-split">
        {words}
        <div className="relative">
          <div
            aria-hidden
            className="absolute start-8 -inset-e-4 top-8 -bottom-4 -z-10 rounded-[var(--s-radius)] bg-[var(--s-accent)] @4xl/site:-inset-e-6 @4xl/site:-bottom-6"
          />
          <MediaView
            media={data.media}
            context={context}
            ratio="4 / 5"
            seed={section.id}
            feature
            phoneRatio="4 / 3"
            className="max-h-[40rem]"
          />
        </div>
      </div>
    );
  if (variant === "collage") {
    const [second, third] = data.more;
    return (
      <div className="site-split">
        {words}
        <div className="relative mx-auto aspect-square w-full max-w-xl">
          <div className="site-feature absolute inset-y-[4%] start-[14%] w-[60%]">
            <MediaView
              media={data.media}
              context={context}
              seed={section.id}
              className="size-full rounded-none"
            />
          </div>
          <div className="absolute end-0 top-[8%] aspect-[4/3] w-[42%] overflow-hidden rounded-[var(--s-radius)] shadow-[var(--s-shadow-lift)] ring-8 ring-[var(--s-bg)]">
            <SitePicture
              image={second?.image ?? { fileId: null, alt: "" }}
              context={context}
              seed={second?.id ?? `${section.id}-2`}
              className="size-full rounded-none"
            />
          </div>
          <div className="absolute start-0 bottom-[6%] aspect-square w-[36%] overflow-hidden rounded-full shadow-[var(--s-shadow-lift)] ring-8 ring-[var(--s-bg)]">
            <SitePicture
              image={third?.image ?? { fileId: null, alt: "" }}
              context={context}
              seed={third?.id ?? `${section.id}-3`}
              className="size-full rounded-none"
            />
          </div>
          <span
            aria-hidden
            className="absolute end-[10%] bottom-0 size-14 rounded-full bg-[var(--s-accent)]"
          />
          <span
            aria-hidden
            className="absolute start-[8%] top-0 size-6 rounded-full border-4 border-[var(--s-link)]"
          />
        </div>
      </div>
    );
  }
  if (variant === "statement")
    return (
      <div className="relative grid gap-10">
        <div
          data-stagger
          className="site-stack relative z-10 @3xl/site:max-w-[70%]"
        >
          <Eyebrow field="eyebrow">{data.eyebrow}</Eyebrow>
          <Heading level={first ? 1 : 2} size="xl" field="heading">
            {data.heading}
          </Heading>
          <div className="grid items-end gap-6 @3xl/site:grid-cols-[1fr_auto]">
            <Lead field="text">{data.text}</Lead>
            <Actions actions={data.actions} context={context} size="lg" />
          </div>
        </div>
        <div className="site-feature -rotate-2 shadow-[var(--s-shadow-lift)] @3xl/site:absolute @3xl/site:end-0 @3xl/site:top-[8%] @3xl/site:w-[28%]">
          <MediaView
            media={data.media}
            context={context}
            ratio="4 / 5"
            seed={section.id}
            phoneRatio="4 / 3"
            className="rounded-none"
          />
        </div>
      </div>
    );
  if (variant === "inset")
    return (
      <div className="grid gap-[var(--s-intro-gap)]">
        {words}
        <MediaView
          media={data.media}
          context={context}
          ratio="21 / 9"
          seed={section.id}
          feature
          phoneRatio="4 / 3"
        />
      </div>
    );
  return (
    <div className="grid gap-[var(--s-intro-gap)]">
      <div data-stagger className="site-stack">
        <Eyebrow field="eyebrow">{data.eyebrow}</Eyebrow>
        <Heading level={first ? 1 : 2} size="xl" field="heading">
          {data.heading}
        </Heading>
        <Lead field="text">{data.text}</Lead>
        <Actions actions={data.actions} context={context} size="lg" />
      </div>
      <div aria-hidden className="h-px w-full bg-[var(--s-border)]" />
    </div>
  );
}

/** Slides that turn on their own until a visitor pauses them, and never for anyone who asks for less motion. */
function Slides({ section, context, first }: Props<"slides">) {
  const { data, variant } = section;
  const t = { locale: context.locale };
  const slides = data.items;
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const current = count ? index % count : 0;
  const seconds = data.interval === "off" ? 0 : Number(data.interval);
  useEffect(() => {
    if (!seconds || paused || count < 2 || context.editing) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return undefined;
    const timer = window.setTimeout(
      () => setIndex((current + 1) % count),
      seconds * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [current, seconds, paused, count, context.editing]);
  if (count === 0) return null;
  const go = (by: number) => setIndex((value) => (value + by + count) % count);
  const level = (at: number) => (first && at === 0 ? 1 : first ? 2 : 3);
  const controls = (
    <div className="relative z-20 flex items-center gap-2">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label={m.sitePreviousSlide({}, t)}
        className="site-icon-button backdrop-blur-sm"
      >
        <ChevronLeft aria-hidden className="size-5 rtl:-scale-x-100" />
      </button>
      <div className="flex items-center gap-1.5 px-1">
        {slides.map((slide, at) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => setIndex(at)}
            aria-label={m.siteShowSlide({ number: at + 1, count }, t)}
            aria-current={at === current ? "true" : undefined}
            className={cn(
              "h-2 rounded-full bg-current transition-all",
              at === current
                ? "w-8 opacity-100"
                : "w-2 opacity-45 hover:opacity-80",
            )}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label={m.siteNextSlide({}, t)}
        className="site-icon-button backdrop-blur-sm"
      >
        <ChevronRight aria-hidden className="size-5 rtl:-scale-x-100" />
      </button>
      {seconds && count > 1 ? (
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-label={
            paused ? m.sitePlaySlides({}, t) : m.sitePauseSlides({}, t)
          }
          className="site-icon-button ms-1 backdrop-blur-sm motion-reduce:hidden"
        >
          {paused ? (
            <Play aria-hidden className="size-4" />
          ) : (
            <Pause aria-hidden className="size-4" />
          )}
        </button>
      ) : null}
    </div>
  );
  const words = (slide: (typeof slides)[number], at: number) => (
    <div className="site-stack">
      <Eyebrow>{slide.eyebrow}</Eyebrow>
      <Heading level={level(at)} size="display">
        {slide.heading}
      </Heading>
      <Lead>{slide.text}</Lead>
      <Actions actions={slide.actions} context={context} size="lg" />
    </div>
  );
  if (variant === "split")
    return (
      <section
        aria-roledescription="carousel"
        aria-label={withoutEmphasis(slides[0]?.heading ?? "")}
        className="site-split"
      >
        <div className="grid">
          {slides.map((slide, at) => (
            <div
              key={slide.id}
              aria-roledescription="slide"
              aria-hidden={at !== current}
              inert={at !== current}
              className={cn(
                "col-start-1 row-start-1 transition-[opacity,translate] duration-700",
                at === current
                  ? "opacity-100"
                  : "pointer-events-none translate-y-3 opacity-0",
              )}
            >
              {words(slide, at)}
            </div>
          ))}
          <div className="mt-8">{controls}</div>
        </div>
        <div className="grid">
          {slides.map((slide, at) => (
            <div
              key={slide.id}
              aria-hidden
              className={cn(
                "col-start-1 row-start-1 transition-opacity duration-700",
                at === current ? "opacity-100" : "opacity-0",
              )}
            >
              <SitePicture
                image={slide.image}
                context={context}
                ratio="4 / 5"
                seed={slide.id}
                feature
                phoneRatio="4 / 3"
                className="max-h-[40rem]"
              />
            </div>
          ))}
        </div>
      </section>
    );
  return (
    <section
      aria-roledescription="carousel"
      aria-label={withoutEmphasis(slides[0]?.heading ?? "")}
      className={cn(
        "relative isolate grid overflow-hidden",
        HEIGHT[data.height],
      )}
      style={overMediaStyle}
    >
      {slides.map((slide, at) => {
        const src = slide.image.fileId
          ? context.fileUrl(slide.image.fileId)
          : null;
        return (
          <div
            key={slide.id}
            aria-roledescription="slide"
            aria-hidden={at !== current}
            inert={at !== current}
            className={cn(
              "col-start-1 row-start-1 flex items-end transition-opacity duration-1000",
              at === current ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
              {src ? (
                <img
                  src={src}
                  alt=""
                  className={cn(
                    "site-photo size-full object-cover transition-transform duration-[7000ms] ease-out",
                    at === current && !context.editing
                      ? "scale-105"
                      : "scale-100",
                  )}
                  style={focusStyle(slide.image.focus)}
                />
              ) : (
                <SiteArt seed={slide.id} kind="mesh" className="rounded-none" />
              )}
              <Scrim photo={Boolean(src)} strength="l" />
            </div>
            <div className="site-container pt-[calc(var(--s-space)*1.6)] pb-[calc(var(--s-space)+5rem)]">
              {words(slide, at)}
            </div>
          </div>
        );
      })}
      <div className="pointer-events-none absolute inset-x-0 bottom-0">
        <div className="site-container pointer-events-auto flex pb-[calc(var(--s-space)*0.6)] text-white">
          {controls}
        </div>
      </div>
    </section>
  );
}

function PageHeader({ section, context, first }: Props<"pageHeader">) {
  const { data, variant } = section;
  const words = (
    <div data-stagger className="site-stack">
      <Eyebrow field="eyebrow">{data.eyebrow}</Eyebrow>
      <Heading level={first ? 1 : 2} size="display" field="heading">
        {data.heading}
      </Heading>
      <Lead field="text">{data.text}</Lead>
    </div>
  );
  if (variant === "banner")
    return (
      <div
        className="relative isolate flex min-h-[22rem] items-end overflow-hidden @3xl/site:min-h-[30rem]"
        style={overMediaStyle}
      >
        <Backdrop media={data.media} context={context} seed={section.id} />
        <div className="site-container pt-[calc(var(--s-space)*1.6)] pb-[calc(var(--s-space)*0.8)]">
          {words}
        </div>
      </div>
    );
  if (variant === "image")
    return (
      <div className="site-split" data-ratio="7-5">
        {words}
        <MediaView
          media={data.media}
          context={context}
          ratio="4 / 3"
          seed={section.id}
          feature
        />
      </div>
    );
  return words;
}

function Announcement({ section, context }: Props<"announcement">) {
  const { data, variant } = section;
  const date = data.date
    ? formatDate(data.date, "medium", context.locale)
    : null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-8 gap-y-5",
        variant === "card" && "site-card p-[var(--s-card-pad)]",
      )}
    >
      <div className="flex min-w-0 flex-[1_1_28rem] items-center gap-4 @3xl/site:gap-5">
        <span aria-hidden className="site-marker size-11 @3xl/site:size-12">
          <Megaphone className="size-5 rtl:-scale-x-100" />
        </span>
        <p className="grid gap-0.5 text-[1.0625rem] leading-[calc(var(--s-line)-0.2)] font-semibold @3xl/site:text-[1.125rem]">
          {date ? <span className="site-meta">{date}</span> : null}
          {data.text}
        </p>
      </div>
      <Actions actions={data.actions} context={context} />
    </div>
  );
}

function Welcome({ section, context }: Props<"welcome">) {
  const { data, variant } = section;
  const signature = (
    <p className="mt-2 grid gap-0.5 border-s-2 border-[var(--s-link)] ps-4">
      <span className="site-heading site-h4">{data.name}</span>
      <span className="site-meta">{data.role}</span>
    </p>
  );
  const words = (
    <div className="site-stack">
      <Heading field="heading">{data.heading}</Heading>
      <div className="text-[1.125rem]">
        <Prose body={data.body} context={context} />
      </div>
      {signature}
    </div>
  );
  if (variant === "letter") return <div className="site-narrow">{words}</div>;
  return (
    <div className="site-split" data-ratio="5-7">
      <div data-order={variant === "portraitEnd" ? "end" : undefined}>
        <SitePicture
          image={data.portrait}
          context={context}
          ratio="4 / 5"
          seed={section.id}
          feature
          phoneRatio="1 / 1"
          className="max-h-[38rem]"
        />
      </div>
      {words}
    </div>
  );
}

function Text({ section, context }: Props<"text">) {
  const { data, variant } = section;
  if (variant === "statement")
    return (
      <div data-stagger className="site-stack site-narrow gap-8" data-wide>
        <Eyebrow field="eyebrow">{data.eyebrow}</Eyebrow>
        <Heading size="statement" field="heading">
          {data.heading}
        </Heading>
        <div className="site-lead w-full">
          <Prose body={data.body} context={context} />
        </div>
      </div>
    );
  return (
    <div className={cn("site-stack", variant === "narrow" && "site-narrow")}>
      <Eyebrow field="eyebrow">{data.eyebrow}</Eyebrow>
      <Heading field="heading">{data.heading}</Heading>
      <div
        className={cn(
          variant === "columns" && "@4xl/site:columns-2 @4xl/site:gap-14",
        )}
      >
        <Prose body={data.body} context={context} />
      </div>
    </div>
  );
}

function ImageText({ section, context }: Props<"imageText">) {
  const { data, variant } = section;
  const words = (
    <div
      data-stagger
      className={cn(
        "site-stack",
        variant === "overlap" &&
          "site-card relative z-10 p-[var(--s-card-pad)] shadow-[var(--s-shadow-lift)] @3xl/site:-ms-20 @4xl/site:p-12",
      )}
      style={variant === "overlap" ? { background: "var(--s-bg)" } : undefined}
    >
      <Eyebrow field="eyebrow">{data.eyebrow}</Eyebrow>
      <Heading field="heading">{data.heading}</Heading>
      <Prose body={data.body} context={context} />
      <Actions actions={data.actions} context={context} />
    </div>
  );
  return (
    <div
      className={cn("site-split", variant === "overlap" && "@3xl/site:gap-0")}
    >
      <div data-order={variant === "mediaEnd" ? "end" : undefined}>
        <MediaView
          media={data.media}
          context={context}
          ratio="5 / 4"
          seed={section.id}
          feature
        />
      </div>
      {words}
    </div>
  );
}

function IconTile({ icon }: { icon: IconId }) {
  if (icon === "none") return null;
  return (
    <span className="site-icon-tile">
      <SiteIcon icon={icon} />
    </span>
  );
}

/** A picture with its words laid over the lower part, the way into a page. */
function PictureTile({
  image,
  seed,
  context,
  ratio,
  children,
}: {
  image: SectionOf<"cards">["data"]["items"][number]["image"];
  seed: string;
  context: RenderContext;
  ratio: string;
  children: ReactNode;
}) {
  return (
    <div
      className="site-zoom group relative isolate overflow-hidden rounded-[var(--s-radius)] text-start"
      style={{ aspectRatio: ratio, ...overMediaStyle }}
    >
      <SitePicture
        image={image}
        context={context}
        seed={seed}
        className="absolute inset-0 -z-10 rounded-none"
      />
      <div className="absolute inset-0 -z-10">
        <Scrim photo={Boolean(image.fileId)} />
      </div>
      <div className="absolute inset-x-0 bottom-0 grid gap-2 p-[var(--s-card-pad)]">
        {children}
      </div>
    </div>
  );
}

function Cards({ section, context }: Props<"cards">) {
  const { data, variant } = section;
  const t = { locale: context.locale };
  return (
    <div>
      <SectionIntro heading={data.heading} text={data.text} />
      <ul
        data-stagger
        className={variant === "scroller" ? "site-rail" : "site-grid"}
        data-cols={variant === "scroller" ? undefined : data.columns}
      >
        {data.items.map((item) => {
          const body =
            variant === "imageButtons" ? (
              <PictureTile
                image={item.image}
                seed={item.id}
                context={context}
                ratio="4 / 5"
              >
                <span className="flex items-end justify-between gap-3">
                  <span className="site-heading site-h3">{item.title}</span>
                  {item.href ? (
                    <ArrowUpRight
                      aria-hidden
                      className="site-arrow size-6 shrink-0 rtl:-scale-x-100"
                    />
                  ) : null}
                </span>
              </PictureTile>
            ) : (
              <div className="site-card flex h-full flex-col overflow-hidden text-start">
                {variant === "grid" || variant === "scroller" ? (
                  <div className="overflow-hidden">
                    <SitePicture
                      image={item.image}
                      context={context}
                      ratio="3 / 2"
                      seed={item.id}
                      className="rounded-none"
                    />
                  </div>
                ) : null}
                <div className="site-card-body">
                  {variant === "icons" ? <IconTile icon={item.icon} /> : null}
                  <Heading level={3}>{item.title}</Heading>
                  {item.text ? <p className="site-text">{item.text}</p> : null}
                  {item.href ? (
                    <TextLink context={context} className="mt-auto pt-2">
                      {m.siteLearnMore({}, t)}
                    </TextLink>
                  ) : null}
                </div>
              </div>
            );
          return (
            <li key={item.id}>
              {item.href ? (
                <SiteAnchor
                  href={item.href}
                  context={context}
                  className="site-zoom block h-full"
                >
                  {body}
                </SiteAnchor>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Divisions({ section, context }: Props<"divisions">) {
  const { data, variant } = section;
  return (
    <div>
      <SectionIntro heading={data.heading} text={data.text} />
      {variant === "rail" ? (
        <ul
          data-stagger
          className="site-feature site-joined"
          style={{ "--count": data.items.length } as CSSProperties}
        >
          {data.items.map((item) => (
            <li key={item.id} className="relative isolate">
              <SiteAnchor
                href={item.href}
                context={context}
                className="site-zoom group block h-full text-start"
              >
                <SitePicture
                  image={item.image}
                  context={context}
                  seed={item.id}
                  className="absolute inset-0 -z-10 size-full rounded-none"
                />
                <div className="absolute inset-0 -z-10">
                  <Scrim photo={Boolean(item.image.fileId)} />
                </div>
                <div
                  className="flex h-full flex-col justify-between gap-6 p-[var(--s-card-pad)]"
                  style={overMediaStyle}
                >
                  <span className="site-heading site-h3">{item.title}</span>
                  <span className="grid gap-1.5">
                    <span className="site-meta text-[var(--s-fg)]">
                      {item.ages}
                    </span>
                    {item.text ? (
                      <span className="site-small text-[var(--s-muted)]">
                        {item.text}
                      </span>
                    ) : null}
                  </span>
                </div>
              </SiteAnchor>
            </li>
          ))}
        </ul>
      ) : variant === "rows" ? (
        <ul data-stagger className="grid gap-4">
          {data.items.map((item) => (
            <li key={item.id}>
              <SiteAnchor
                href={item.href}
                context={context}
                className="site-card site-zoom grid items-center overflow-hidden text-start @3xl/site:grid-cols-[18rem_1fr_auto]"
              >
                <div className="h-full overflow-hidden">
                  <SitePicture
                    image={item.image}
                    context={context}
                    ratio="16 / 10"
                    seed={item.id}
                    className="rounded-none"
                  />
                </div>
                <div className="grid gap-2 p-[var(--s-card-pad)]">
                  <span className="site-eyebrow">{item.ages}</span>
                  <Heading level={3}>{item.title}</Heading>
                  {item.text ? <p className="site-text">{item.text}</p> : null}
                </div>
                {item.href ? (
                  <Arrow className="me-[var(--s-card-pad)] hidden size-6 text-[var(--s-link)] @3xl/site:block" />
                ) : null}
              </SiteAnchor>
            </li>
          ))}
        </ul>
      ) : (
        <ul
          data-stagger
          className="site-grid"
          data-cols={columnsFor(data.items.length)}
          data-rail
        >
          {data.items.map((item) => (
            <li key={item.id}>
              <SiteAnchor href={item.href} context={context} className="block">
                <PictureTile
                  image={item.image}
                  seed={item.id}
                  context={context}
                  ratio="3 / 4"
                >
                  <span className="site-meta text-[var(--s-fg)]">
                    {item.ages}
                  </span>
                  <span className="site-heading site-h2">{item.title}</span>
                  {item.text ? (
                    <span className="site-small max-w-xs text-[var(--s-muted)]">
                      {item.text}
                    </span>
                  ) : null}
                  {item.href ? (
                    <span className="mt-3 inline-grid size-11 place-items-center rounded-full bg-white text-black">
                      <Arrow />
                    </span>
                  ) : null}
                </PictureTile>
              </SiteAnchor>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Figure({
  value,
  label,
  caption,
  context,
}: {
  value: string;
  label: string;
  caption?: string;
  context: RenderContext;
}) {
  const ref = useCountUp(
    value,
    !context.editing && context.theme.motion !== "none",
  );
  return (
    <div className="grid content-start gap-3 border-s border-[var(--s-border)] ps-6 text-start">
      <dd ref={ref} className="site-figure order-1">
        {value}
      </dd>
      <dt className="order-2 font-semibold">{label}</dt>
      {caption ? (
        <dd className="site-text site-small order-3">{caption}</dd>
      ) : null}
    </div>
  );
}

function Stats({ section, context }: Props<"stats">) {
  const { data, variant } = section;
  const figures = (columns: "2" | "3" | "4") => (
    <dl data-stagger className="site-grid gap-y-12" data-cols={columns}>
      {data.items.map((item) => (
        <Figure
          key={item.id}
          value={item.value}
          label={item.label}
          caption={variant === "captions" ? item.caption : undefined}
          context={context}
        />
      ))}
    </dl>
  );
  return (
    <div>
      <SectionIntro heading={data.heading} />
      {variant === "overImage" ? (
        <div className="site-split">
          <MediaView
            media={data.media}
            context={context}
            ratio="4 / 3"
            seed={section.id}
            feature
          />
          {figures("2")}
        </div>
      ) : (
        figures(columnsFor(data.items.length, 4))
      )}
      {data.source ? <p className="site-meta mt-10">{data.source}</p> : null}
    </div>
  );
}

/**
 * A school's values as words too large to sit still, moving across the
 * band with a pause button, and wrapping in place for anyone who asks for
 * less motion.
 */
function Ticker({
  section,
  context,
}: {
  section: SectionOf<"pillars">;
  context: RenderContext;
}) {
  const { data } = section;
  const [paused, setPaused] = useState(false);
  const t = { locale: context.locale };
  const words = data.items.map((item) => item.title).filter(Boolean);
  const run = (copy: number) => (
    <ul
      key={copy}
      aria-hidden={copy === 1}
      className="flex shrink-0 items-center"
    >
      {words.map((word, index) => (
        <li key={`${copy}-${index}`} className="flex items-center">
          <span className="site-ticker-word">{word}</span>
          <span aria-hidden className="site-ticker-mark" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="grid gap-[var(--s-intro-gap)]">
      {data.heading || data.text ? (
        <div className="[&_.site-intro]:mb-0">
          <SectionIntro heading={data.heading} text={data.text} />
        </div>
      ) : null}
      <div className="site-ticker">
        <div className="site-marquee" data-paused={paused || undefined}>
          {[0, 1].map(run)}
        </div>
      </div>
      {context.editing ? null : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-label={
              paused ? m.sitePlayMarquee({}, t) : m.sitePauseMarquee({}, t)
            }
            className="site-icon-button motion-reduce:hidden"
          >
            {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          </button>
        </div>
      )}
    </div>
  );
}

function Pillars({ section, context }: Props<"pillars">) {
  const { data, variant } = section;
  const numeral = (index: number) =>
    new Intl.NumberFormat(numberLocale(context.locale), {
      minimumIntegerDigits: 2,
    }).format(index + 1);
  if (variant === "ticker")
    return <Ticker section={section} context={context} />;
  if (variant === "alternating")
    return (
      <div>
        <SectionIntro heading={data.heading} text={data.text} />
        <div className="grid gap-[var(--s-split-gap)]">
          {data.items.map((item, index) => (
            <div key={item.id} className="site-split">
              <div data-order={index % 2 === 1 ? "end" : undefined}>
                <SitePicture
                  image={item.image}
                  context={context}
                  ratio="5 / 4"
                  seed={item.id}
                  feature
                />
              </div>
              <div className="site-stack">
                <span className="site-numeral">{numeral(index)}</span>
                <Heading>{item.title}</Heading>
                <p className="site-lead">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  return (
    <div>
      <SectionIntro heading={data.heading} text={data.text} />
      <ol
        data-stagger
        className="site-grid gap-y-10"
        data-cols={columnsFor(data.items.length, 4)}
      >
        {data.items.map((item, index) => (
          <li
            key={item.id}
            className={cn(
              "grid content-start gap-3 text-start",
              // On a phone an icon sits beside its words, not above them.
              variant === "icons" &&
                "grid-cols-[3rem_1fr] gap-x-4 @3xl/site:grid-cols-1 [&>*:first-child]:row-span-2 @3xl/site:[&>*:first-child]:row-span-1 @3xl/site:[&>*:first-child]:mb-2",
            )}
          >
            {variant === "numbered" ? (
              <span className="site-numeral mb-2 border-b border-[var(--s-border)] pb-4">
                {numeral(index)}
              </span>
            ) : (
              <IconTile icon={item.icon} />
            )}
            <Heading level={3}>{item.title}</Heading>
            {item.text ? <p className="site-text">{item.text}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function QuoteSection({ section, context }: Props<"quote">) {
  const { data, variant } = section;
  const who = (
    <figcaption className="grid gap-0.5">
      <span className="font-semibold">{data.name}</span>
      {data.role ? <span className="site-meta">{data.role}</span> : null}
    </figcaption>
  );
  return (
    <figure
      className={cn(
        "site-narrow grid gap-8",
        variant === "portrait" &&
          "items-center @3xl/site:grid-cols-[12rem_1fr] @3xl/site:gap-12",
      )}
      data-wide
    >
      {variant === "portrait" ? (
        <SitePicture
          image={data.portrait}
          context={context}
          ratio="1 / 1"
          seed={section.id}
          className="max-w-48 rounded-full"
        />
      ) : null}
      <div className="site-stack gap-6">
        {variant === "badge" && data.badge !== "none" ? (
          <span className="site-eyebrow rounded-full px-4 py-1.5 ring-1 ring-[var(--s-border)]">
            {BADGE_NAME[data.badge]}
          </span>
        ) : (
          <QuoteMark className="size-10" />
        )}
        <blockquote className="site-quote">{data.quote}</blockquote>
        {who}
      </div>
    </figure>
  );
}

function Voices({ section, context }: Props<"voices">) {
  const { data, variant } = section;
  const [tab, setTab] = useState<string>("all");
  const t = { locale: context.locale };
  const audience: Record<string, string> = {
    student: m.siteAudienceStudent({}, t),
    parent: m.siteAudienceParent({}, t),
    staff: m.siteAudienceStaff({}, t),
    alumni: m.siteAudienceAlumni({}, t),
  };
  const audiences = [...new Set(data.items.map((item) => item.audience))];
  const items =
    variant === "tabs" && tab !== "all"
      ? data.items.filter((item) => item.audience === tab)
      : data.items;
  return (
    <div>
      <SectionIntro heading={data.heading} />
      {variant === "tabs" && audiences.length > 1 ? (
        <div role="tablist" className="site-actions mb-[var(--s-intro-gap)]">
          {["all", ...audiences].map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className="site-button"
              data-size="sm"
              data-variant={tab === value ? undefined : "secondary"}
            >
              {value === "all" ? m.siteAudienceAll({}, t) : audience[value]}
            </button>
          ))}
        </div>
      ) : null}
      <ul
        data-stagger
        className={variant === "carousel" ? "site-rail" : "site-grid"}
        style={
          variant === "carousel"
            ? ({ "--s-rail-item": "26rem" } as CSSProperties)
            : undefined
        }
        data-cols={
          variant === "carousel" ? undefined : columnsFor(items.length)
        }
        data-rail
      >
        {items.map((item) => (
          <li key={item.id}>
            <figure className="site-card flex h-full flex-col gap-5 p-[var(--s-card-pad)] text-start">
              <QuoteMark />
              <blockquote className="site-quote" data-size="s">
                {item.quote}
              </blockquote>
              <figcaption className="mt-auto flex items-center gap-3 border-t border-[var(--s-border)] pt-5">
                {item.portrait.fileId ? (
                  <SitePicture
                    image={item.portrait}
                    context={context}
                    ratio="1 / 1"
                    seed={item.id}
                    className="size-11 shrink-0 rounded-full"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="site-heading grid size-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--s-link)_14%,transparent)] text-[var(--s-link)]"
                  >
                    {item.name.trim().charAt(0)}
                  </span>
                )}
                <span className="grid">
                  <span className="font-semibold">{item.name}</span>
                  <span className="site-meta">{item.role}</span>
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}

function People({ section, context }: Props<"people">) {
  const { data, variant } = section;
  return (
    <div>
      <SectionIntro heading={data.heading} text={data.text} />
      <ul
        data-stagger
        className={
          variant === "carousel"
            ? "site-rail"
            : "grid grid-cols-2 gap-x-[var(--s-grid-gap)] gap-y-10 @3xl/site:grid-cols-3 @5xl/site:grid-cols-4"
        }
        style={
          variant === "carousel"
            ? ({ "--s-rail-item": "17rem" } as CSSProperties)
            : undefined
        }
      >
        {data.items.map((item) => (
          <li key={item.id} className="grid content-start gap-4 text-start">
            <div className="site-feature">
              <SitePicture
                image={item.portrait}
                context={context}
                ratio="4 / 5"
                seed={item.id}
                className="rounded-none"
              />
            </div>
            <span className="grid gap-1">
              <span className="site-heading site-h4">{item.name}</span>
              <span className="site-meta">{item.role}</span>
            </span>
            {item.text ? (
              <p className="site-text site-small">{item.text}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function embedDocument(provider: string, embedId: string) {
  return {
    root: {
      type: "root" as const,
      version: 1 as const,
      children: [
        {
          type: "embed" as const,
          version: 1 as const,
          provider: provider as never,
          embedId,
        },
      ],
    },
  };
}

function Video({ section, context }: Props<"video">) {
  const { data, variant } = section;
  const player = data.embed ? (
    <div className="site-feature">
      <ContentView
        document={embedDocument(data.embed.provider, data.embed.embedId)}
      />
    </div>
  ) : (
    <MediaView
      media={data.media}
      context={context}
      ratio="16 / 9"
      seed={section.id}
      feature
    />
  );
  if (variant === "beside")
    return (
      <div className="site-split" data-ratio="2-3">
        <div data-stagger className="site-stack">
          <Heading field="heading">{data.heading}</Heading>
          <Lead field="text">{data.text}</Lead>
          <Actions actions={data.actions} context={context} />
        </div>
        {player}
      </div>
    );
  return (
    <div
      className={cn(variant === "inset" && "site-narrow")}
      data-wide={variant === "inset" || undefined}
    >
      <SectionIntro heading={data.heading} text={data.text} />
      {player}
      <Actions actions={data.actions} context={context} className="mt-8" />
    </div>
  );
}

/**
 * A photograph opened large, over the page, with the others a step away.
 * The native dialog traps focus and closes on Escape.
 */
function Lightbox({
  photos,
  index,
  context,
  onClose,
  onGo,
}: {
  photos: { id: string; src: string; alt: string }[];
  index: number | null;
  context: RenderContext;
  onClose: () => void;
  onGo: (index: number) => void;
}) {
  const t = { locale: context.locale };
  const dialog = useRef<HTMLDialogElement>(null);
  const count = photos.length;
  const current = index === null ? undefined : photos[index];
  useEffect(() => {
    const element = dialog.current;
    if (!element) return undefined;
    if (index === null) {
      if (element.open) element.close();
      return undefined;
    }
    if (!element.open) element.showModal();
    const rtl = context.locale === "ar";
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const forward = (event.key === "ArrowRight") !== rtl;
      onGo((index + (forward ? 1 : -1) + count) % count);
    };
    element.addEventListener("keydown", onKey);
    return () => element.removeEventListener("keydown", onKey);
  }, [index, count, context.locale, onGo]);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/95 p-0 text-white backdrop:bg-black/80"
    >
      {current ? (
        <figure className="grid h-full grid-rows-[1fr_auto] gap-3 p-4 @3xl/site:p-10">
          <img
            src={current.src}
            alt={current.alt}
            className="size-full min-h-0 object-contain"
          />
          <figcaption className="flex items-center justify-between gap-4 text-sm">
            <span dir="auto" className="opacity-85">
              {current.alt}
            </span>
            <span className="shrink-0 tabular-nums opacity-70">
              {m.sitePhotoCount({ number: (index ?? 0) + 1, count }, t)}
            </span>
          </figcaption>
        </figure>
      ) : null}
      <button
        type="button"
        onClick={onClose}
        aria-label={m.siteClosePhoto({}, t)}
        className="absolute end-4 top-4 grid size-11 place-items-center rounded-[var(--s-button-radius)] bg-white/10 hover:bg-white/20"
      >
        <X aria-hidden className="size-5" />
      </button>
      {count > 1 && index !== null ? (
        <>
          <button
            type="button"
            onClick={() => onGo((index - 1 + count) % count)}
            aria-label={m.sitePreviousPhoto({}, t)}
            className="absolute start-4 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-[var(--s-button-radius)] bg-white/10 hover:bg-white/20"
          >
            <ChevronLeft aria-hidden className="size-6 rtl:-scale-x-100" />
          </button>
          <button
            type="button"
            onClick={() => onGo((index + 1) % count)}
            aria-label={m.siteNextPhoto({}, t)}
            className="absolute end-4 top-1/2 grid size-12 -translate-y-1/2 place-items-center rounded-[var(--s-button-radius)] bg-white/10 hover:bg-white/20"
          >
            <ChevronRight aria-hidden className="size-6 rtl:-scale-x-100" />
          </button>
        </>
      ) : null}
    </dialog>
  );
}

/**
 * Where each picture of a bento grid sits: in groups of four, one large,
 * two small and one wide, the large one changing sides each group, so
 * every row of four (and of two on a phone) is filled. A last group of
 * one, two or three shares a row between them.
 */
function bentoSpan(index: number, count: number): string {
  const grouped = count - (count % 4);
  if (index < grouped) {
    const odd = Math.floor(index / 4) % 2 === 1;
    const group = odd
      ? ["", "", "col-span-2 row-span-2", "col-span-2"]
      : ["col-span-2 row-span-2", "", "", "col-span-2"];
    return group[index % 4] ?? "";
  }
  const rest = count % 4;
  if (rest === 1) return "col-span-2 @4xl/site:col-span-4";
  if (rest === 2) return "@4xl/site:col-span-2";
  return index === grouped ? "col-span-2" : "";
}

const TALL = 5;
const SHORT = 3;

/**
 * A masonry of tall and short pictures packed into the shortest column,
 * then the last picture in each column stretched to the tallest, so the
 * columns end on one line. Positions are in rows a quarter of a column
 * wide, worked out for two columns and for three.
 */
function masonry(count: number, columns: number) {
  const heights = Array.from({ length: columns }, () => 0);
  const last = Array.from({ length: columns }, () => -1);
  const placed = Array.from({ length: count }, (_, index) => {
    const column = heights.indexOf(Math.min(...heights));
    const row = heights[column] ?? 0;
    const span = index % 3 === 0 ? TALL : SHORT;
    heights[column] = row + span;
    last[column] = index;
    return { column, row, span };
  });
  const tallest = Math.max(...heights);
  last.forEach((index, column) => {
    const item = placed[index];
    if (item) item.span += tallest - (heights[column] ?? tallest);
  });
  return placed;
}

function Gallery({ section, context }: Props<"gallery">) {
  const { data, variant } = section;
  const t = { locale: context.locale };
  const [open, setOpen] = useState<number | null>(null);
  const photos = data.items.flatMap((item) => {
    const src = item.image.fileId ? context.fileUrl(item.image.fileId) : null;
    return src ? [{ id: item.id, src, alt: item.image.alt }] : [];
  });
  const count = data.items.length;
  const two = masonry(count, Math.min(2, count));
  const three = masonry(count, Math.min(3, count));
  const list = (
    <ul
      data-stagger
      className={cn(
        variant === "masonry"
          ? "site-masonry"
          : variant === "carousel"
            ? "site-rail"
            : "grid auto-rows-[minmax(8rem,18cqi)] grid-cols-2 gap-3 @3xl/site:gap-4 @4xl/site:grid-cols-4",
      )}
      style={
        variant === "carousel"
          ? ({ "--s-rail-item": "30rem" } as CSSProperties)
          : variant === "masonry"
            ? ({
                "--s-columns-2": Math.min(2, count),
                "--s-columns-3": Math.min(3, count),
              } as CSSProperties)
            : undefined
      }
    >
      {data.items.map((item, index) => {
        const picture = (
          <SitePicture
            image={item.image}
            context={context}
            seed={item.id}
            ratio={variant === "carousel" ? "4 / 3" : undefined}
            className={variant === "carousel" ? undefined : "size-full"}
          />
        );
        const at = photos.findIndex((photo) => photo.id === item.id);
        const small = two[index];
        const large = three[index];
        return (
          <li
            key={item.id}
            className={cn(variant === "grid" && bentoSpan(index, count))}
            style={
              variant === "masonry" && small && large
                ? ({
                    "--s-at-2": `${small.row + 1} / span ${small.span}`,
                    "--s-in-2": small.column + 1,
                    "--s-at-3": `${large.row + 1} / span ${large.span}`,
                    "--s-in-3": large.column + 1,
                  } as CSSProperties)
                : undefined
            }
          >
            {at >= 0 && !context.editing ? (
              <button
                type="button"
                onClick={() => setOpen(at)}
                aria-label={m.siteOpenPhoto({ alt: item.image.alt }, t)}
                className="site-zoom block size-full cursor-zoom-in overflow-hidden rounded-[var(--s-radius)]"
              >
                {picture}
              </button>
            ) : (
              picture
            )}
          </li>
        );
      })}
    </ul>
  );
  return (
    <div>
      <SectionIntro heading={data.heading} />
      {variant === "masonry" ? (
        <div className="site-masonry-frame">{list}</div>
      ) : (
        list
      )}
      <Lightbox
        photos={photos}
        index={open}
        context={context}
        onClose={() => setOpen(null)}
        onGo={setOpen}
      />
    </div>
  );
}

function Timeline({ section }: Props<"timeline">) {
  const { data, variant } = section;
  return (
    <div>
      <SectionIntro heading={data.heading} />
      <ol
        data-stagger
        className={cn(
          variant === "horizontal"
            ? "flex snap-x gap-10 overflow-x-auto border-t-2 border-[var(--s-border)] pt-10 pb-4 [&>li]:w-72 [&>li]:shrink-0 [&>li]:snap-start"
            : "site-narrow grid gap-12 border-s-2 border-[var(--s-border)] ps-10",
        )}
      >
        {data.items.map((item) => (
          <li key={item.id} className="relative grid gap-2 text-start">
            <span
              aria-hidden
              className={cn(
                "absolute size-4 rounded-full border-4 border-[var(--s-bg)] bg-[var(--s-link)] outline-2 outline-[var(--s-link)]",
                variant === "horizontal"
                  ? "start-0 -top-[calc(3rem+1px)]"
                  : "-start-[calc(3rem+1px)] top-2",
              )}
            />
            <span className="site-numeral text-[2rem]">{item.year}</span>
            <span className="site-heading site-h3">{item.title}</span>
            {item.text ? <p className="site-text">{item.text}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Accordion({ section }: Props<"accordion">) {
  const { data, variant } = section;
  const [open, setOpen] = useState(0);
  if (variant === "tabs")
    return (
      <div>
        <SectionIntro heading={data.heading} text={data.text} />
        <div
          role="tablist"
          className="mb-8 flex flex-wrap gap-2 border-b border-[var(--s-border)]"
        >
          {data.items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={open === index}
              onClick={() => setOpen(index)}
              className={cn(
                "-mb-px border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
                open === index
                  ? "border-[var(--s-link)] text-[var(--s-link)]"
                  : "site-muted border-transparent",
              )}
            >
              {item.title}
            </button>
          ))}
        </div>
        <p
          role="tabpanel"
          className="site-narrow text-[1.125rem] leading-relaxed whitespace-pre-line"
        >
          {data.items[open]?.text}
        </p>
      </div>
    );
  const list = (
    <div className="divide-y divide-[var(--s-border)] border-y border-[var(--s-border)]">
      {data.items.map((item) => (
        <details key={item.id} className="group text-start">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-[1.125rem] font-semibold [&::-webkit-details-marker]:hidden">
            {item.title}
            <span aria-hidden className="site-icon-button size-9">
              <Plus className="size-4 transition-transform duration-300 group-open:rotate-45" />
            </span>
          </summary>
          <p className="site-text max-w-2xl pb-6 whitespace-pre-line">
            {item.text}
          </p>
        </details>
      ))}
    </div>
  );
  if (variant === "columns")
    return (
      <div
        className="site-split items-start [&_.site-intro]:mb-0"
        data-ratio="2-3"
      >
        <SectionIntro heading={data.heading} text={data.text} />
        {list}
      </div>
    );
  return (
    <div className="site-narrow">
      <SectionIntro heading={data.heading} text={data.text} />
      {list}
    </div>
  );
}

function Logo({
  item,
  context,
}: {
  item: SectionOf<"logos">["data"]["items"][number];
  context: RenderContext;
}) {
  return (
    <SiteAnchor
      href={item.href}
      context={context}
      className="grid place-items-center opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0"
    >
      {item.image.fileId ? (
        <SitePicture
          image={{ ...item.image, alt: item.image.alt || item.name }}
          context={context}
          art={false}
          className="h-14 w-auto rounded-none object-contain"
        />
      ) : (
        <span className="site-heading text-xl tracking-wide whitespace-nowrap">
          {item.name}
        </span>
      )}
    </SiteAnchor>
  );
}

function Logos({ section, context }: Props<"logos">) {
  const { data, variant } = section;
  const [paused, setPaused] = useState(false);
  const t = { locale: context.locale };
  const heading = <Eyebrow field="heading">{data.heading}</Eyebrow>;
  if (variant === "marquee")
    return (
      <div className="grid gap-10">
        {heading}
        <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
          <div
            className="site-marquee gap-16"
            data-paused={paused || undefined}
          >
            {[0, 1].map((copy) => (
              <ul
                key={copy}
                aria-hidden={copy === 1}
                className="flex shrink-0 items-center gap-16 pe-16"
              >
                {data.items.map((item) => (
                  <li key={item.id}>
                    <Logo item={item} context={context} />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-label={
            paused ? m.sitePlayMarquee({}, t) : m.sitePauseMarquee({}, t)
          }
          className="justify-self-center rounded-full border border-[var(--s-border)] p-2.5 motion-reduce:hidden"
        >
          {paused ? (
            <Play aria-hidden className="size-4" />
          ) : (
            <Pause aria-hidden className="size-4" />
          )}
        </button>
      </div>
    );
  return (
    <div className="grid gap-10">
      {heading}
      <ul
        data-stagger
        className={cn(
          variant === "grid"
            ? "grid grid-cols-2 gap-8 @3xl/site:grid-cols-4"
            : "flex flex-wrap items-center gap-x-16 gap-y-8",
          section.style.align === "center" && "justify-center",
        )}
      >
        {data.items.map((item) => (
          <li key={item.id} className="grid place-items-center">
            <Logo item={item} context={context} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Cover({
  item,
  className,
}: {
  item: RenderContext["news"][number];
  className?: string;
}) {
  return (
    <div className="overflow-hidden">
      {item.coverKey ? (
        <img
          src={publicMediaUrl(item.coverKey)}
          alt={item.coverAlt}
          loading="lazy"
          className={cn("site-media site-photo rounded-none", className)}
        />
      ) : (
        <SiteArt seed={item.postId} className={cn("rounded-none", className)} />
      )}
    </div>
  );
}

function News({ section, context }: Props<"news">) {
  const { data, variant } = section;
  const t = { locale: context.locale };
  const items = context.news.slice(0, data.count);
  return (
    <div>
      <div className="site-intro-row">
        <Heading field="heading">{data.heading}</Heading>
        <TextLink href="/news" context={context}>
          {m.siteAllNews({}, t)}
        </TextLink>
      </div>
      {items.length === 0 ? (
        <p className="site-text">
          {context.editing ? m.siteNewsPreview({}, t) : m.siteNoNews({}, t)}
        </p>
      ) : variant === "list" ? (
        <ul
          data-stagger
          className="divide-y divide-[var(--s-border)] border-y border-[var(--s-border)]"
        >
          {items.map((item) => (
            <li key={item.postId}>
              <SiteAnchor
                href={`/news/${item.slug}`}
                context={context}
                className="group grid items-center gap-2 py-6 text-start @3xl/site:grid-cols-[11rem_1fr_auto] @3xl/site:gap-10"
              >
                <time className="site-meta" dateTime={item.publishedAt}>
                  {formatInstant(item.publishedAt, "date", context.locale)}
                </time>
                <span className="site-heading site-h3 group-hover:text-[var(--s-link)]">
                  {item.title}
                </span>
                <Arrow className="hidden text-[var(--s-link)] @3xl/site:block" />
              </SiteAnchor>
            </li>
          ))}
        </ul>
      ) : (
        <ul
          data-stagger
          className="site-grid"
          data-cols={variant === "featured" ? "2" : columnsFor(items.length)}
          data-rail
        >
          {items.map((item, index) => {
            const lead = variant === "featured" && index === 0;
            return (
              <li
                key={item.postId}
                className={cn(lead && "@3xl/site:row-span-2")}
              >
                <SiteAnchor
                  href={`/news/${item.slug}`}
                  context={context}
                  className="site-card flex h-full flex-col overflow-hidden text-start"
                >
                  <Cover
                    item={item}
                    className={lead ? "aspect-[4/3]" : "aspect-[3/2]"}
                  />
                  <div className="site-card-body">
                    <time className="site-meta" dateTime={item.publishedAt}>
                      {formatInstant(item.publishedAt, "date", context.locale)}
                    </time>
                    <span
                      className={cn(
                        "site-heading",
                        lead ? "site-h2" : "site-h3",
                      )}
                    >
                      {item.title}
                    </span>
                    {item.excerpt ? (
                      <span className="site-text line-clamp-3">
                        {item.excerpt}
                      </span>
                    ) : null}
                  </div>
                </SiteAnchor>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface Listed {
  id: string;
  date: string;
  title: string;
  location: string;
  href: string;
  /** A time, or that it is called off or not yet confirmed. */
  note: string;
}

/** What the events section lists: the calendar's public events, or its own typed items. */
function listedEvents(
  data: SectionOf<"events">["data"],
  context: RenderContext,
): Listed[] {
  const t = { locale: context.locale };
  if (data.source === "typed")
    return data.items.map((item) => ({ ...item, note: "" }));
  return (context.events ?? []).slice(0, data.count).map((event) => ({
    id: event.id,
    date: event.startsOn,
    title:
      (context.locale === "ar"
        ? (event.titleAr ?? event.titleEn)
        : (event.titleEn ?? event.titleAr)) ?? "",
    location: event.location ?? "",
    href: "",
    note: event.cancelled
      ? m.siteEventCancelled({}, t)
      : event.provisional
        ? m.siteEventTbc({}, t)
        : event.startTime
          ? event.startTime
          : "",
  }));
}

function Events({ section, context }: Props<"events">) {
  const { data, variant } = section;
  const t = { locale: context.locale };
  const items = listedEvents(data, context);
  const dayMonth = (date: string) =>
    date
      ? {
          day: formatDate(date, "day", context.locale),
          month: formatMonthShort(date, context.locale),
        }
      : { day: "", month: "" };
  return (
    <div>
      <SectionIntro heading={data.heading} />
      {items.length === 0 ? (
        <p className="site-text">
          {context.editing && data.source !== "typed"
            ? m.siteEventsFromCalendar({}, t)
            : m.siteEventsNone({}, t)}
        </p>
      ) : null}
      <ul
        data-stagger
        className={variant === "cards" ? "site-grid" : "grid gap-3"}
        data-cols={variant === "cards" ? columnsFor(items.length) : undefined}
      >
        {items.map((item) => {
          const { day, month } = dayMonth(item.date);
          return (
            <li key={item.id}>
              <SiteAnchor
                href={item.href}
                context={context}
                className={cn(
                  "site-card group flex items-center gap-5 p-4 text-start @3xl/site:gap-6 @3xl/site:p-5",
                  variant === "cards" &&
                    "h-full flex-col items-start p-[var(--s-card-pad)]",
                )}
              >
                <span className="grid min-h-[4.5rem] min-w-[4.5rem] shrink-0 place-items-center rounded-[var(--s-radius-sm)] bg-[var(--s-btn)] px-3 py-3 text-[var(--s-btn-fg)]">
                  {day ? (
                    <>
                      <span
                        className="site-heading text-3xl leading-none font-bold"
                        style={{ color: "inherit" }}
                      >
                        {day}
                      </span>
                      <span className="text-xs font-bold tracking-wider uppercase">
                        {month}
                      </span>
                    </>
                  ) : (
                    <CalendarDays aria-hidden className="size-7" />
                  )}
                </span>
                <span className="grid flex-1 gap-1">
                  <span className="site-heading site-h3">{item.title}</span>
                  {item.location || item.note ? (
                    <span className="site-muted inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      {item.note ? (
                        <span dir="auto">
                          <bdi>{item.note}</bdi>
                        </span>
                      ) : null}
                      {item.location ? (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin aria-hidden className="size-4" />
                          {item.location}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
                {item.href && variant === "list" ? (
                  <Arrow className="text-[var(--s-link)] transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                ) : null}
              </SiteAnchor>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const FEE_WORDS: Record<
  string,
  (inputs: object, options: { locale: "en" | "ar" }) => string
> = {
  application: m.itkFeeApplication,
  assessment: m.itkFeeAssessment,
  registration: m.itkFeeRegistration,
  tuition: m.itkFeeTuition,
  other: m.itkFeeOther,
};

const intakeGrade = (intake: SiteIntake, locale: "en" | "ar") =>
  (locale === "ar"
    ? (intake.gradeAr ?? intake.gradeEn)
    : (intake.gradeEn ?? intake.gradeAr)) ?? "";
const intakeYear = (intake: SiteIntake, locale: "en" | "ar") =>
  (locale === "ar"
    ? (intake.yearTitleAr ?? intake.yearTitleEn)
    : (intake.yearTitleEn ?? intake.yearTitleAr)) ?? "";

/** A link into the portal, which the builder shows without following. */
function PortalLink({
  href,
  context,
  className,
  size,
  children,
}: {
  href: string;
  context: RenderContext;
  className?: string;
  size?: "lg";
  children: ReactNode;
}) {
  return context.editing ? (
    <span className={className} data-size={size}>
      {children}
    </span>
  ) : (
    <a href={href} className={className} data-size={size}>
      {children}
    </a>
  );
}

/** Each intake still to close: its grade and year, when families apply, its fees and the way in. */
function IntakeCards({
  intakes,
  context,
  compact,
}: {
  intakes: SiteIntake[];
  context: RenderContext;
  compact: boolean;
}) {
  const t = { locale: context.locale };
  const money = (currency: string, amount: number) =>
    new Intl.NumberFormat(numberLocale(context.locale), {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  return (
    <ul
      data-stagger
      className={compact ? "grid gap-4" : "site-grid"}
      data-cols={compact ? undefined : columnsFor(intakes.length)}
    >
      {intakes.map((intake) => {
        const upcoming = context.today ? context.today < intake.opensOn : false;
        return (
          <li
            key={intake.id}
            className="site-card grid content-between gap-6 p-[var(--s-card-pad)] text-start"
          >
            <div className="grid gap-3">
              <span className="site-eyebrow">
                {intakeYear(intake, context.locale)}
              </span>
              <Heading level={3}>{intakeGrade(intake, context.locale)}</Heading>
              <p className="site-muted">
                {upcoming
                  ? m.siteIntakeOpens(
                      {
                        date: formatDate(
                          intake.opensOn,
                          "medium",
                          context.locale,
                        ),
                      },
                      t,
                    )
                  : m.siteIntakeCloses(
                      {
                        date: formatDate(
                          intake.closesOn,
                          "medium",
                          context.locale,
                        ),
                      },
                      t,
                    )}
              </p>
              {intake.decisionsOn ? (
                <p className="site-muted text-sm">
                  {m.siteIntakeDecisions(
                    {
                      date: formatDate(
                        intake.decisionsOn,
                        "medium",
                        context.locale,
                      ),
                    },
                    t,
                  )}
                </p>
              ) : null}
              {intake.fees.length ? (
                <dl className="grid gap-1 text-sm">
                  {intake.fees.map((fee) => (
                    <div key={fee.kind} className="flex justify-between gap-4">
                      <dt className="site-muted">
                        {(FEE_WORDS[fee.kind] ?? m.itkFeeOther)({}, t)}
                      </dt>
                      <dd className="font-semibold tabular-nums">
                        {money(intake.currency, fee.amount)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </div>
            {upcoming || !context.applyHref ? null : (
              <PortalLink
                href={context.applyHref(intake.id)}
                context={context}
                className="site-button justify-self-start"
              >
                {m.siteIntakeApply({}, t)}
              </PortalLink>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Admissions({ section, context }: Props<"admissions">) {
  const { data, variant } = section;
  if (data.source === "intakes") {
    const intakes =
      variant === "keyDate"
        ? (context.intakes ?? []).slice(0, 1)
        : (context.intakes ?? []);
    return (
      <div>
        <SectionIntro heading={data.heading} text={data.text} />
        {intakes.length ? (
          <IntakeCards
            intakes={intakes}
            context={context}
            compact={variant !== "triad"}
          />
        ) : (
          <p className="site-card site-text flex items-center gap-4 p-[var(--s-card-pad)] text-start">
            <span aria-hidden className="site-icon-tile">
              <CalendarDays />
            </span>
            {context.editing
              ? m.siteIntakesFromAdmissions({}, { locale: context.locale })
              : m.siteIntakesNone({}, { locale: context.locale })}
          </p>
        )}
      </div>
    );
  }
  const date = data.date
    ? formatDate(data.date, "medium", context.locale)
    : null;
  if (variant === "banner" || variant === "keyDate")
    return (
      <div className="grid items-end gap-10 @3xl/site:grid-cols-[1fr_auto]">
        <div data-stagger className="site-stack">
          {variant === "keyDate" && date ? (
            <span className="site-eyebrow">{date}</span>
          ) : null}
          <Heading field="heading">{data.heading}</Heading>
          <Lead field="text">{data.text}</Lead>
        </div>
        <Actions
          actions={data.items.flatMap((item) => item.actions)}
          context={context}
          size="lg"
        />
      </div>
    );
  return (
    <div>
      <SectionIntro heading={data.heading} text={data.text} />
      <ol
        data-stagger
        className="site-grid"
        data-cols={columnsFor(data.items.length)}
      >
        {data.items.map((item, index) => (
          <li
            key={item.id}
            className="site-card grid content-between gap-8 p-[var(--s-card-pad)] text-start"
          >
            <div className="grid gap-3">
              <span className="site-numeral">
                {new Intl.NumberFormat(numberLocale(context.locale)).format(
                  index + 1,
                )}
              </span>
              <Heading level={3}>{item.title}</Heading>
              {item.text ? <p className="site-text">{item.text}</p> : null}
            </div>
            <Actions actions={item.actions} context={context} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The way in to applying: a family registers on the portal, or carries on
 * if signed in, preset to the intake the section names. An intake that has
 * closed, or is still to open, says so instead of offering the way in.
 */
function RegisterApply({ section, context }: Props<"registerApply">) {
  const { data, variant } = section;
  const t = { locale: context.locale };
  const named = data.intake
    ? (context.intakes ?? []).find((intake) => intake.id === data.intake)
    : null;
  const notYet = named && context.today ? context.today < named.opensOn : false;
  const gone = Boolean(data.intake) && !named && !context.editing;
  const label = data.button.trim() || m.siteRegisterApplyButton({}, t);
  return (
    <div
      className={cn(
        "grid gap-8",
        variant === "banner"
          ? "items-end @3xl/site:grid-cols-[1fr_auto]"
          : "site-card site-narrow p-[var(--s-card-pad)] @3xl/site:p-12",
      )}
    >
      <div data-stagger className="site-stack">
        <Eyebrow field="eyebrow">{data.eyebrow}</Eyebrow>
        <Heading field="heading">{data.heading}</Heading>
        <Lead field="text">{data.text}</Lead>
        {named ? (
          <p className="site-text">
            {m.siteRegisterApplyFor(
              {
                grade: intakeGrade(named, context.locale),
                year: intakeYear(named, context.locale),
              },
              t,
            )}
          </p>
        ) : null}
      </div>
      {gone ? (
        <p className="site-muted">{m.siteRegisterApplyClosed({}, t)}</p>
      ) : notYet && named ? (
        <p className="site-muted">
          {m.siteIntakeOpens(
            { date: formatDate(named.opensOn, "medium", context.locale) },
            t,
          )}
        </p>
      ) : context.applyHref ? (
        <PortalLink
          href={context.applyHref(named?.id ?? null)}
          context={context}
          className="site-button justify-self-start"
          size="lg"
        >
          {label}
        </PortalLink>
      ) : null}
    </div>
  );
}

function Steps({ section, context }: Props<"steps">) {
  const { data, variant } = section;
  const number = (index: number) =>
    new Intl.NumberFormat(numberLocale(context.locale)).format(index + 1);
  const count = data.items.length;
  // Steps that fit one row are joined by a line from marker to marker.
  const row = count <= 3;
  const wide = count <= 4;
  return (
    <div>
      <SectionIntro heading={data.heading} text={data.text} />
      <ol
        data-stagger
        className={cn(
          variant === "horizontal"
            ? cn(
                "grid gap-0 @3xl/site:gap-10",
                count === 3 ? "@3xl/site:grid-cols-3" : "@3xl/site:grid-cols-2",
                count === 4
                  ? "@5xl/site:grid-cols-4"
                  : count > 4 && "@5xl/site:grid-cols-3",
              )
            : "site-narrow grid gap-0",
        )}
      >
        {data.items.map((item, index) => (
          <li
            key={item.id}
            className={cn(
              "relative grid content-start gap-4 text-start",
              variant === "horizontal"
                ? cn(
                    "grid-cols-[3.5rem_1fr] gap-x-5 pb-8 before:absolute before:start-7 before:top-14 before:bottom-0 before:w-px before:bg-[var(--s-border)] last:before:hidden @3xl/site:grid-cols-1 @3xl/site:gap-4 @3xl/site:pb-0 @3xl/site:before:hidden",
                    index < count - 1 &&
                      "after:absolute after:start-[4.25rem] after:top-7 after:hidden after:h-px after:w-[calc(100%-2.5rem)] after:bg-[var(--s-border)]",
                    index < count - 1 && row && "@3xl/site:after:block",
                    index < count - 1 && wide && "@5xl/site:after:block",
                  )
                : "grid-cols-[3.5rem_1fr] gap-6 pb-10 before:absolute before:start-7 before:top-14 before:bottom-0 before:w-px before:bg-[var(--s-border)] last:before:hidden",
            )}
          >
            <span className="site-heading site-marker relative z-10 size-14 text-xl">
              {number(index)}
            </span>
            <span className="grid gap-1.5 pt-3 @3xl/site:pt-0">
              <span className="site-heading site-h3">{item.title}</span>
              {item.text ? (
                <span className="site-text">{item.text}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Fees({ section }: Props<"fees">) {
  const { data, variant } = section;
  return (
    <div className="site-narrow" data-wide>
      <SectionIntro heading={data.heading} text={data.text} />
      {variant === "table" ? (
        <div className="site-card overflow-x-auto">
          <table className="w-full text-start">
            <tbody className="divide-y divide-[var(--s-border)]">
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th
                    scope="row"
                    className="px-[var(--s-card-pad)] py-5 text-start font-semibold"
                  >
                    {item.label}
                    {item.note ? (
                      <span className="site-meta mt-1 block font-normal">
                        {item.note}
                      </span>
                    ) : null}
                  </th>
                  <td className="site-heading px-[var(--s-card-pad)] py-5 text-end text-xl tabular-nums">
                    {item.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <dl className="grid gap-4">
          {data.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-baseline justify-between gap-4 border-b border-[var(--s-border)] pb-4"
            >
              <dt className="font-semibold">{item.label}</dt>
              <dd className="site-heading text-xl tabular-nums">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function ContactList({ context }: { context: RenderContext }) {
  const contact = context.contact;
  if (!contact) return null;
  const address = [
    ...(contact.address?.lines ?? []),
    contact.address?.city,
    contact.address?.country,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <ul className="grid gap-4">
      {address ? (
        <li className="flex items-start gap-3">
          <MapPin
            aria-hidden
            className="mt-1 size-5 shrink-0 text-[var(--s-link)]"
          />
          <span dir="auto">{address}</span>
        </li>
      ) : null}
      {contact.phone ? (
        <li className="flex items-start gap-3">
          <Phone
            aria-hidden
            className="mt-1 size-5 shrink-0 text-[var(--s-link)]"
          />
          <a
            href={`tel:${contact.phone}`}
            dir="ltr"
            className="hover:underline"
          >
            {contact.phone}
          </a>
        </li>
      ) : null}
      {contact.email ? (
        <li className="flex items-start gap-3">
          <Mail
            aria-hidden
            className="mt-1 size-5 shrink-0 text-[var(--s-link)]"
          />
          <a
            href={`mailto:${contact.email}`}
            dir="ltr"
            className="hover:underline"
          >
            {contact.email}
          </a>
        </li>
      ) : null}
    </ul>
  );
}

function Contact({ section, context }: Props<"contact">) {
  const { data, variant } = section;
  const t = { locale: context.locale };
  return (
    <div className={cn(variant === "map" && "site-split")}>
      <div className="site-stack">
        <Heading field="heading">{data.heading}</Heading>
        <Lead field="text">{data.text}</Lead>
        <div className="text-[1.125rem]">
          <ContactList context={context} />
        </div>
        {data.mapHref ? (
          <div className="site-actions">
            <SiteAnchor
              href={data.mapHref}
              context={context}
              className="site-button"
              variant="secondary"
            >
              <Link2 aria-hidden />
              {m.siteOpenMap({}, t)}
            </SiteAnchor>
          </div>
        ) : null}
      </div>
      {variant === "map" ? (
        <div className="site-feature relative">
          <SiteArt
            seed={`${section.id}-map`}
            ratio="4 / 3"
            className="rounded-none"
          />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-16 place-items-center rounded-full bg-white text-[var(--s-art-deep)] shadow-[var(--s-shadow-lift)]">
              <MapPin aria-hidden className="size-7" />
            </span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

type FormState =
  | "idle"
  | "sending"
  | "sent"
  | "failed"
  | "limited"
  | "challenge"
  | "reach"
  | "check";

const FAILURE: Partial<Record<string, FormState>> = {
  "site.too_many": "limited",
  "site.challenge": "challenge",
  "validation.required": "check",
  "validation.invalid": "check",
};

type Question = SectionOf<"form">["data"]["questions"][number];

/** How long ago a moment was, read when the form is sent. */
const since = (start: number) => Date.now() - start;

/** One of the school's own questions, drawn as the kind of answer it takes. */
function QuestionField({
  question,
  id,
  context,
}: {
  question: Question;
  id: string;
  context: RenderContext;
}) {
  const t = { locale: context.locale };
  const required = question.required === "required";
  const name = `answer:${question.id}`;
  const hintId = question.hint ? `${id}-hint` : undefined;
  const label = (
    <span>
      {question.label}
      {required ? null : (
        <span className="site-muted font-normal">
          {" "}
          {m.siteFormOptional({}, t)}
        </span>
      )}
    </span>
  );
  const hint = question.hint ? (
    <span id={hintId} className="site-muted text-sm font-normal">
      {question.hint}
    </span>
  ) : null;
  const shared = {
    id,
    name,
    required,
    disabled: context.editing,
    "aria-describedby": hintId,
  };
  if (question.answer === "choice") {
    const options = optionsOf(question.options);
    if (options.length <= 4)
      return (
        <fieldset
          className="site-label @3xl/site:col-span-2"
          aria-describedby={hintId}
        >
          <legend className="mb-2">{label}</legend>
          {hint}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {options.map((option, index) => (
              <label
                key={option}
                htmlFor={`${id}-${index}`}
                className="inline-flex min-h-10 items-center gap-2 font-normal"
              >
                <input
                  id={`${id}-${index}`}
                  type="radio"
                  name={name}
                  value={option}
                  required={required}
                  disabled={context.editing}
                  className="size-4 accent-[var(--s-btn)]"
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
      );
    return (
      <label htmlFor={id} className="site-label">
        {label}
        {hint}
        <select {...shared} className="site-input" defaultValue="">
          <option value="" disabled>
            {m.siteFormChoose({}, t)}
          </option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (question.answer === "long")
    return (
      <label htmlFor={id} className="site-label @3xl/site:col-span-2">
        {label}
        {hint}
        <textarea
          {...shared}
          className="site-input min-h-28"
          maxLength={answerLimit("long")}
        />
      </label>
    );
  return (
    <label htmlFor={id} className="site-label">
      {label}
      {hint}
      <input
        {...shared}
        className="site-input"
        type={question.answer === "date" ? "date" : "text"}
        inputMode={question.answer === "number" ? "decimal" : undefined}
        dir={question.answer === "short" ? undefined : "ltr"}
        maxLength={answerLimit(question.answer)}
      />
    </label>
  );
}

/**
 * An enquiry form: the fixed core (a name, and an email or a phone number)
 * with what the school chose to ask besides. It sends only from a published
 * page; in the builder it shows what visitors will fill in.
 */
function EnquiryForm({ section, context }: Props<"form">) {
  const { data, variant } = section;
  const t = { locale: context.locale };
  const opened = useRef(0);
  const [state, setState] = useState<FormState>("idle");
  const [token, setToken] = useState("");
  const [challenge, setChallenge] = useState(0);
  // Uncontrolled inputs keep what someone typed before the page hydrated,
  // and sending waits for hydration so nothing posts natively.
  const hydrated = useHydrated();
  useEffect(() => {
    opened.current = Date.now();
  }, []);
  const questions = data.questions.filter((question) =>
    context.editing ? question.label.trim() !== "" : questionComplete(question),
  );
  const turnstileKey = context.editing ? null : (context.turnstileKey ?? null);
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (context.editing || state === "sending") return;
    const form = new FormData(event.currentTarget);
    const read = (key: string) => {
      const value = form.get(key);
      return typeof value === "string" ? value.trim() : "";
    };
    if (
      data.email !== "hide" &&
      data.phone !== "hide" &&
      !read("email") &&
      !read("phone")
    ) {
      setState("reach");
      event.currentTarget
        .querySelector<HTMLInputElement>('input[name="email"]')
        ?.focus();
      return;
    }
    if (turnstileKey && !token) {
      setState("challenge");
      return;
    }
    setState("sending");
    try {
      await submitSiteEnquiry({
        data: {
          school: context.school,
          locale: context.locale,
          page: context.page ?? "",
          sectionId: section.id,
          name: read("name"),
          email: read("email"),
          phone: read("phone"),
          childName: read("childName"),
          childYear: read("childYear"),
          message: read("message"),
          answers: Object.fromEntries(
            questions.map((question) => [
              question.id,
              read(`answer:${question.id}`),
            ]),
          ),
          website: read("website"),
          elapsed: since(opened.current),
          turnstile: token,
        },
      });
      setState("sent");
    } catch (error) {
      setState(
        (error instanceof Error ? FAILURE[error.message] : undefined) ??
          "failed",
      );
      // A token works once, so any answer asks for a new check.
      setChallenge((count) => count + 1);
    }
  };
  const id = (name: string) => `${section.id}-${name}`;
  const optional = (
    <span className="site-muted font-normal"> {m.siteFormOptional({}, t)}</span>
  );
  const reachOptional = data.email === "ask" && data.phone === "ask";
  const failure =
    state === "limited"
      ? m.siteFormTooMany({}, t)
      : state === "challenge"
        ? m.siteFormChallenge({}, t)
        : state === "reach"
          ? m.siteFormReach({}, t)
          : state === "check"
            ? m.siteFormCheck({}, t)
            : state === "failed"
              ? m.siteFormFailed({}, t)
              : null;
  const words = (
    <div data-stagger className="site-stack">
      <Eyebrow field="eyebrow">{data.eyebrow}</Eyebrow>
      <Heading field="heading">{data.heading}</Heading>
      <Lead field="text">{data.text}</Lead>
    </div>
  );
  const form =
    state === "sent" ? (
      <output className="site-card grid content-center justify-items-start gap-4 p-[var(--s-card-pad)] text-start">
        <span className="grid size-12 place-items-center rounded-full bg-[var(--s-btn)] text-[var(--s-btn-fg)]">
          <Check aria-hidden className="size-6" />
        </span>
        <span className="site-heading site-h3">{data.thanks}</span>
      </output>
    ) : (
      <form
        onSubmit={(event) => void send(event)}
        className={cn(
          "grid gap-5 text-start",
          variant === "card" && "site-card p-[var(--s-card-pad)]",
        )}
        noValidate={false}
      >
        {reachOptional ? (
          <p id={id("reach")} className="site-muted text-sm">
            {m.siteFormReachHint({}, t)}
          </p>
        ) : null}
        <div className="grid gap-4 @3xl/site:grid-cols-2">
          <label htmlFor={id("name")} className="site-label">
            {m.siteFormName({}, t)}
            <input
              id={id("name")}
              className="site-input"
              required
              maxLength={120}
              autoComplete="name"
              name="name"
              disabled={context.editing}
            />
          </label>
          {data.email === "hide" ? null : (
            <label htmlFor={id("email")} className="site-label">
              <span>
                {m.siteFormEmail({}, t)}
                {data.email === "ask" && !reachOptional ? optional : null}
              </span>
              <input
                id={id("email")}
                className="site-input"
                type="email"
                required={data.email === "require"}
                maxLength={254}
                autoComplete="email"
                dir="ltr"
                name="email"
                aria-describedby={reachOptional ? id("reach") : undefined}
                aria-invalid={state === "reach" || undefined}
                disabled={context.editing}
              />
            </label>
          )}
          {data.phone === "hide" ? null : (
            <label htmlFor={id("phone")} className="site-label">
              <span>
                {m.siteFormPhone({}, t)}
                {data.phone === "ask" && !reachOptional ? optional : null}
              </span>
              <input
                id={id("phone")}
                className="site-input"
                type="tel"
                required={data.phone === "require"}
                maxLength={40}
                autoComplete="tel"
                dir="ltr"
                name="phone"
                aria-describedby={reachOptional ? id("reach") : undefined}
                aria-invalid={state === "reach" || undefined}
                disabled={context.editing}
              />
            </label>
          )}
          {data.child === "hide" ? null : (
            <label htmlFor={id("child")} className="site-label">
              <span>
                {m.siteFormChild({}, t)}
                {optional}
              </span>
              <input
                id={id("child")}
                className="site-input"
                maxLength={120}
                autoComplete="off"
                name="childName"
                disabled={context.editing}
              />
            </label>
          )}
          {data.grade === "hide" ? null : (
            <label htmlFor={id("year")} className="site-label">
              <span>
                {m.siteFormYear({}, t)}
                {optional}
              </span>
              <input
                id={id("year")}
                className="site-input"
                maxLength={60}
                name="childYear"
                disabled={context.editing}
              />
            </label>
          )}
          {questions.map((question) => (
            <QuestionField
              key={question.id}
              question={question}
              id={id(question.id)}
              context={context}
            />
          ))}
        </div>
        {data.message === "hide" ? null : (
          <label htmlFor={id("message")} className="site-label">
            <span>
              {m.siteFormMessage({}, t)}
              {optional}
            </span>
            <textarea
              id={id("message")}
              className="site-input min-h-32"
              maxLength={2000}
              name="message"
              disabled={context.editing}
            />
          </label>
        )}
        <div
          aria-hidden
          className="absolute -start-[9999px] size-px overflow-hidden"
        >
          <label htmlFor={id("website")}>{m.siteFormLeaveEmpty({}, t)}</label>
          <input
            id={id("website")}
            tabIndex={-1}
            autoComplete="off"
            name="website"
          />
        </div>
        {turnstileKey ? (
          <TurnstileWidget
            siteKey={turnstileKey}
            action="enquiry"
            locale={context.locale}
            generation={challenge}
            onToken={setToken}
          />
        ) : null}
        {failure ? (
          <p
            role="alert"
            className="text-sm font-semibold text-[#B42318] dark:text-[#FDA29B]"
          >
            {failure}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <button
            type="submit"
            className="site-button"
            data-size="lg"
            disabled={!hydrated || state === "sending" || context.editing}
          >
            {state === "sending"
              ? m.siteFormSending({}, t)
              : data.submit || m.siteFormSend({}, t)}
          </button>
          <p className="site-meta">
            {context.editing
              ? m.siteFormPreview({}, t)
              : m.siteFormPrivacy({}, t)}
          </p>
        </div>
      </form>
    );
  if (variant === "split")
    return (
      <div className="site-split items-start" data-ratio="2-3">
        <div className="grid gap-8">
          {words}
          {data.media.fileId ? (
            <MediaView
              media={data.media}
              context={context}
              ratio="4 / 3"
              seed={section.id}
              feature
            />
          ) : null}
        </div>
        <div className="relative">{form}</div>
      </div>
    );
  return (
    <div className="site-narrow relative grid gap-10">
      {words}
      {form}
    </div>
  );
}

function QuickLinks({ section, context }: Props<"quickLinks">) {
  const { data, variant } = section;
  const count = data.items.length;
  const columns = columnsFor(count, 4);
  return (
    <div>
      <SectionIntro heading={data.heading} />
      <ul
        data-stagger
        data-quick={variant}
        className={
          variant === "list"
            ? "grid gap-3 @3xl/site:grid-cols-2"
            : cn(
                "grid grid-cols-2 gap-3 @3xl/site:gap-[var(--s-grid-gap)]",
                // A lone last tile on a phone takes the whole row.
                count % 2 === 1 && "[&>li:last-child]:col-span-2",
                columns === "3"
                  ? "@3xl/site:grid-cols-3 @3xl/site:[&>li:last-child]:col-span-1"
                  : columns === "4"
                    ? "@3xl/site:grid-cols-2 @5xl/site:grid-cols-4 @5xl/site:[&>li:last-child]:col-span-1"
                    : "@3xl/site:grid-cols-2",
              )
        }
      >
        {data.items.map((item) => (
          <li key={item.id}>
            <SiteAnchor
              href={item.href}
              context={context}
              className={cn(
                "site-card group flex h-full text-start",
                variant === "list"
                  ? "min-h-16 items-center gap-4 p-4 @3xl/site:p-5"
                  : "min-h-40 flex-col gap-6 p-5 @3xl/site:min-h-48 @3xl/site:p-6",
              )}
            >
              {variant === "list" ? (
                <>
                  <IconTile icon={item.icon} />
                  <span className="grid flex-1 gap-0.5">
                    <span className="site-heading site-h4">{item.title}</span>
                    {item.text ? (
                      <span className="site-small site-muted">{item.text}</span>
                    ) : null}
                  </span>
                  <Arrow className="shrink-0 text-[var(--s-link)]" />
                </>
              ) : (
                <>
                  <span className="flex items-start justify-between gap-4">
                    {variant === "audience" ? (
                      <SiteIcon icon={item.icon} className="size-8" />
                    ) : (
                      <IconTile icon={item.icon} />
                    )}
                    {item.href ? (
                      <span aria-hidden className="site-quick-arrow ms-auto">
                        <Arrow />
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-auto grid gap-1">
                    <span className="site-heading site-h4">{item.title}</span>
                    {item.text ? (
                      <span className="site-small opacity-80">{item.text}</span>
                    ) : null}
                  </span>
                </>
              )}
            </SiteAnchor>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Embed({ section, context }: Props<"embed">) {
  const { data } = section;
  return (
    <div className="site-narrow grid gap-8" data-wide>
      <Heading field="heading">{data.heading}</Heading>
      {data.embed ? (
        <div className="site-feature">
          <ContentView
            document={embedDocument(data.embed.provider, data.embed.embedId)}
          />
        </div>
      ) : context.editing ? (
        <p className="site-muted grid min-h-48 place-items-center rounded-[var(--s-radius)] border-2 border-dashed border-[var(--s-border)] p-8 text-center">
          {m.siteEmbedEmpty({}, { locale: context.locale })}
        </p>
      ) : null}
    </div>
  );
}

const LAYOUT: Record<string, string> = {
  "1-1": "@3xl/site:grid-cols-2",
  "2-1": "@3xl/site:grid-cols-[2fr_1fr]",
  "1-2": "@3xl/site:grid-cols-[1fr_2fr]",
  "1-1-1": "@3xl/site:grid-cols-3",
  "1-1-1-1": "@3xl/site:grid-cols-2 @5xl/site:grid-cols-4",
  "1": "site-narrow",
};

const RATIO: Record<string, string> = {
  landscape: "4 / 3",
  square: "1 / 1",
  portrait: "3 / 4",
  wide: "16 / 9",
};
const SPACER: Record<string, string> = { s: "h-4", m: "h-10", l: "h-20" };

/** One block of a free-form section. */
function BlockView({
  block,
  context,
}: {
  block: SiteBlock;
  context: RenderContext;
}) {
  switch (block.type) {
    case "heading": {
      const { eyebrow, text, size } = block.data;
      return (
        <div className="grid gap-4">
          <Eyebrow>{eyebrow}</Eyebrow>
          <Heading
            size={size === "xl" ? "display" : size === "m" ? "h3" : "h2"}
          >
            {text}
          </Heading>
        </div>
      );
    }
    case "paragraph":
      return <Prose body={block.data.body} context={context} />;
    case "image": {
      const { image, shape, ratio } = block.data;
      const picture = (
        <SitePicture
          image={image}
          context={context}
          seed={block.id}
          ratio={RATIO[ratio]}
          className={cn(
            "max-h-[36rem]",
            shape === "square" && "rounded-none",
            shape === "rounded" && "rounded-[max(var(--s-radius),1.25rem)]",
            shape === "circle" && "rounded-full",
          )}
          feature={shape === "theme"}
        />
      );
      return picture;
    }
    case "buttons":
      return <Actions actions={block.data.actions} context={context} />;
    case "list":
      return (
        <ul className="grid gap-3">
          {block.data.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3">
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[color-mix(in_oklab,var(--s-link)_14%,transparent)] text-[var(--s-link)]">
                {item.icon === "none" ? (
                  <Check aria-hidden className="size-4" />
                ) : (
                  <SiteIcon icon={item.icon} className="size-4" />
                )}
              </span>
              <span className="text-[1.05rem] leading-relaxed">
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      );
    case "stat":
      return (
        <dl>
          <Figure
            value={block.data.value}
            label={block.data.label}
            context={context}
          />
        </dl>
      );
    case "quote":
      return (
        <figure className="grid gap-4 border-s-4 border-[var(--s-link)] ps-6">
          <blockquote className="site-heading text-xl leading-snug font-medium">
            {block.data.quote}
          </blockquote>
          <figcaption className="text-sm">
            <span className="font-semibold">{block.data.name}</span>
            {block.data.role ? (
              <span className="site-muted"> · {block.data.role}</span>
            ) : null}
          </figcaption>
        </figure>
      );
    case "feature":
      return (
        <div className="grid gap-3">
          <IconTile icon={block.data.icon} />
          <Heading level={3}>{block.data.title}</Heading>
          {block.data.text ? (
            <p className="site-muted leading-relaxed">{block.data.text}</p>
          ) : null}
        </div>
      );
    case "video":
      return block.data.embed ? (
        <div className="site-feature">
          <ContentView
            document={embedDocument(
              block.data.embed.provider,
              block.data.embed.embedId,
            )}
          />
        </div>
      ) : (
        <MediaView
          media={block.data.media}
          context={context}
          ratio="16 / 9"
          seed={block.id}
          feature
        />
      );
    case "spacer":
      return <div aria-hidden className={SPACER[block.data.size]} />;
    case "divider":
      return block.data.style === "line" ? (
        <hr className="border-[var(--s-border)]" />
      ) : (
        <div
          aria-hidden
          className="flex items-center justify-center gap-3 text-[var(--s-link)]"
        >
          {block.data.style === "dots" ? (
            [0, 1, 2].map((dot) => (
              <span key={dot} className="size-1.5 rounded-full bg-current" />
            ))
          ) : (
            <>
              <span className="h-px w-16 bg-current opacity-50" />
              <span className="size-2.5 rotate-45 bg-current" />
              <span className="h-px w-16 bg-current opacity-50" />
            </>
          )}
        </div>
      );
  }
  return null;
}

function Blocks({ section, context }: Props<"blocks">) {
  const { data } = section;
  return (
    <div>
      <SectionIntro
        eyebrow={data.eyebrow}
        heading={data.heading}
        text={data.text}
      />
      <div
        data-stagger
        className={cn(
          "grid gap-[var(--s-split-gap)]",
          LAYOUT[data.layout],
          data.valign === "center" && "items-center",
        )}
      >
        {data.columns.map((column) => (
          <div key={column.id} className="grid min-w-0 content-start gap-6">
            {column.blocks.map((block) => (
              <BlockView key={block.id} block={block} context={context} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * One section as visitors see it. A section shown in the other language
 * carries that language, so screen readers pronounce it right.
 */
export function SiteSection({
  section,
  shownIn,
  context,
  first,
  joined = false,
}: {
  section: PageSection;
  shownIn: SiteLocale;
  context: RenderContext;
  first: boolean;
  joined?: boolean;
}) {
  const t = { locale: context.locale };
  const full = fullBleed(section);
  const body = (() => {
    switch (section.type) {
      case "hero":
        return <Hero section={section} context={context} first={first} />;
      case "slides":
        return <Slides section={section} context={context} first={first} />;
      case "pageHeader":
        return <PageHeader section={section} context={context} first={first} />;
      case "announcement":
        return (
          <Announcement section={section} context={context} first={first} />
        );
      case "welcome":
        return <Welcome section={section} context={context} first={first} />;
      case "text":
        return <Text section={section} context={context} first={first} />;
      case "blocks":
        return <Blocks section={section} context={context} first={first} />;
      case "imageText":
        return <ImageText section={section} context={context} first={first} />;
      case "cards":
        return <Cards section={section} context={context} first={first} />;
      case "divisions":
        return <Divisions section={section} context={context} first={first} />;
      case "stats":
        return <Stats section={section} context={context} first={first} />;
      case "pillars":
        return <Pillars section={section} context={context} first={first} />;
      case "quote":
        return (
          <QuoteSection section={section} context={context} first={first} />
        );
      case "voices":
        return <Voices section={section} context={context} first={first} />;
      case "people":
        return <People section={section} context={context} first={first} />;
      case "video":
        return <Video section={section} context={context} first={first} />;
      case "gallery":
        return <Gallery section={section} context={context} first={first} />;
      case "timeline":
        return <Timeline section={section} context={context} first={first} />;
      case "accordion":
        return <Accordion section={section} context={context} first={first} />;
      case "logos":
        return <Logos section={section} context={context} first={first} />;
      case "news":
        return <News section={section} context={context} first={first} />;
      case "events":
        return <Events section={section} context={context} first={first} />;
      case "admissions":
        return <Admissions section={section} context={context} first={first} />;
      case "registerApply":
        return (
          <RegisterApply section={section} context={context} first={first} />
        );
      case "steps":
        return <Steps section={section} context={context} first={first} />;
      case "fees":
        return <Fees section={section} context={context} first={first} />;
      case "contact":
        return <Contact section={section} context={context} first={first} />;
      case "form":
        return (
          <EnquiryForm section={section} context={context} first={first} />
        );
      case "quickLinks":
        return <QuickLinks section={section} context={context} first={first} />;
      case "embed":
        return <Embed section={section} context={context} first={first} />;
    }
    return null;
  })();
  return (
    <div
      lang={shownIn === context.locale ? undefined : shownIn}
      dir={
        shownIn === context.locale
          ? undefined
          : shownIn === "ar"
            ? "rtl"
            : "ltr"
      }
    >
      <SectionFrame
        section={section}
        context={context}
        full={full}
        padded={!full}
        joined={joined}
        labels={{
          pause: m.sitePauseVideo({}, t),
          play: m.sitePlayVideo({}, t),
        }}
      >
        {body}
      </SectionFrame>
    </div>
  );
}
