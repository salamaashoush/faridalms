import type {
  IconId,
  PageSection,
  SectionOf,
  SiteBlock,
  SiteLocale,
} from "@faridalms/domain/site-sections";
import type { CSSProperties, FormEvent } from "react";

import { withoutEmphasis } from "@faridalms/domain/site-sections";
import { useHydrated } from "@tanstack/react-router";
import {
  ArrowRight,
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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ContentView } from "~/components/content/ContentView";
import * as m from "~/i18n/messages";
import { submitSiteEnquiry } from "~/server/site";
import { cn } from "~/utils/cn";

import type { RenderContext } from "./parts";

import { SiteArt } from "./art";
import { useCountUp } from "./motion";
import {
  Actions,
  BackgroundVideo,
  Eyebrow,
  Heading,
  Lead,
  MediaView,
  Picture,
  Prose,
  publicMediaUrl,
  SectionFrame,
  SectionIntro,
  SiteAnchor,
  SiteIcon,
  siteDate,
} from "./parts";

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

/** Words over a photograph read white; the scrim below keeps them legible. */
const OVER_PICTURE = {
  "--s-fg": "#fff",
  "--s-heading": "#fff",
  "--s-muted": "rgba(255,255,255,.86)",
  "--s-link": "#fff",
  "--s-btn": "#fff",
  "--s-btn-fg": "#111",
  "--s-border": "rgba(255,255,255,.35)",
  "--s-em": "var(--s-accent)",
} as CSSProperties;

const Arrow = ({ className }: { className?: string }) => (
  <ArrowRight
    aria-hidden
    className={cn("size-4 rtl:-scale-x-100", className)}
  />
);

/** The picture, film or artwork a full-bleed opening sits on. */
function Backdrop({
  media,
  context,
  seed,
}: {
  media: SectionOf<"hero">["data"]["media"];
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
        <img src={src} alt={media.alt} className="size-full object-cover" />
      ) : (
        <SiteArt seed={seed} kind="mesh" className="rounded-none" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/5" />
      <div className="bg-gradient-to-e absolute inset-0 from-black/45 to-transparent" />
    </div>
  );
}

function Hero({ section, context, first }: Props<"hero">) {
  const { data, variant } = section;
  const center = section.style.align === "center";
  const title = <Heading level={first ? 1 : 2}>{data.heading}</Heading>;
  const words = (
    <div
      data-stagger
      className={cn("grid gap-6", center && "justify-items-center text-center")}
    >
      <Eyebrow>{data.eyebrow}</Eyebrow>
      {title}
      <Lead className="max-w-2xl text-[1.15rem]">{data.text}</Lead>
      <Actions
        actions={data.actions}
        context={context}
        className={cn("mt-2", center && "justify-center")}
      />
    </div>
  );
  if (variant === "fullbleed")
    return (
      <div
        className={cn(
          "relative isolate flex items-end overflow-hidden",
          HEIGHT[data.height],
        )}
        style={OVER_PICTURE}
      >
        <Backdrop media={data.media} context={context} seed={section.id} />
        <div
          className={cn(
            "mx-auto w-full max-w-[84rem] px-5 pt-44 pb-16 @3xl/site:px-8 @3xl/site:pb-24",
            center && "grid justify-items-center",
          )}
        >
          <div className="max-w-4xl">{words}</div>
        </div>
      </div>
    );
  if (variant === "split")
    return (
      <div className="grid items-center gap-12 py-[calc(var(--s-space)*0.25)] @4xl/site:grid-cols-[1.05fr_1fr] @4xl/site:gap-16">
        {words}
        <div className="relative">
          <div
            aria-hidden
            className="absolute start-8 -inset-e-4 top-8 -bottom-4 -z-10 rounded-[max(var(--s-radius),1rem)] bg-[var(--s-accent)] opacity-90 @4xl/site:-inset-e-6 @4xl/site:-bottom-6"
          />
          <MediaView
            media={data.media}
            context={context}
            ratio="4 / 5"
            seed={section.id}
            feature
            className="max-h-[40rem]"
          />
        </div>
      </div>
    );
  if (variant === "inset")
    return (
      <div className="grid justify-items-center gap-12 text-center">
        <div data-stagger className="grid max-w-4xl justify-items-center gap-6">
          <Eyebrow>{data.eyebrow}</Eyebrow>
          {title}
          <Lead className="text-[1.15rem]">{data.text}</Lead>
          <Actions
            actions={data.actions}
            context={context}
            className="justify-center"
          />
        </div>
        <div className="w-full">
          <MediaView
            media={data.media}
            context={context}
            ratio="21 / 9"
            seed={section.id}
            feature
          />
        </div>
      </div>
    );
  return (
    <div className="grid gap-8 py-[calc(var(--s-space)*0.4)] [&_h1]:text-[clamp(2.9rem,1.4rem+5.6cqi,6.5rem)] [&_h2]:text-[clamp(2.9rem,1.4rem+5.6cqi,6.5rem)]">
      <div className="max-w-5xl">{words}</div>
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
        className="grid size-11 place-items-center rounded-full border border-[var(--s-border)] backdrop-blur-sm transition-colors hover:bg-white/15"
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
        className="grid size-11 place-items-center rounded-full border border-[var(--s-border)] backdrop-blur-sm transition-colors hover:bg-white/15"
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
          className="ms-1 grid size-11 place-items-center rounded-full border border-[var(--s-border)] backdrop-blur-sm motion-reduce:hidden"
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
    <div className="grid max-w-3xl gap-5">
      <Eyebrow>{slide.eyebrow}</Eyebrow>
      <Heading level={level(at)} size="display">
        {slide.heading}
      </Heading>
      <Lead className="text-[1.15rem]">{slide.text}</Lead>
      <Actions actions={slide.actions} context={context} className="mt-1" />
    </div>
  );
  if (variant === "split")
    return (
      <section
        aria-roledescription="carousel"
        aria-label={withoutEmphasis(slides[0]?.heading ?? "")}
        className="grid items-center gap-10 @4xl/site:grid-cols-2 @4xl/site:gap-16"
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
              <Picture
                image={slide.image}
                context={context}
                ratio="4 / 5"
                seed={slide.id}
                feature
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
      style={OVER_PICTURE}
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
                    "size-full object-cover transition-transform duration-[7000ms] ease-out",
                    at === current && !context.editing
                      ? "scale-105"
                      : "scale-100",
                  )}
                />
              ) : (
                <SiteArt seed={slide.id} kind="mesh" className="rounded-none" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/5" />
              <div className="bg-gradient-to-e absolute inset-0 from-black/45 to-transparent" />
            </div>
            <div className="mx-auto w-full max-w-[84rem] px-5 pt-44 pb-32 @3xl/site:px-8">
              {words(slide, at)}
            </div>
          </div>
        );
      })}
      <div className="pointer-events-none absolute inset-x-0 bottom-0">
        <div className="pointer-events-auto mx-auto flex w-full max-w-[84rem] px-5 pb-10 text-white @3xl/site:px-8">
          {controls}
        </div>
      </div>
    </section>
  );
}

function PageHeader({ section, context, first }: Props<"pageHeader">) {
  const { data, variant } = section;
  return (
    <div
      className={cn(
        "grid items-center gap-10",
        variant === "image" &&
          "@4xl/site:grid-cols-[1.2fr_1fr] @4xl/site:gap-16",
      )}
    >
      <div data-stagger className="grid max-w-3xl gap-5">
        <Eyebrow>{data.eyebrow}</Eyebrow>
        <Heading level={first ? 1 : 2} size="display">
          {data.heading}
        </Heading>
        <Lead className="text-[1.15rem]">{data.text}</Lead>
      </div>
      {variant === "image" ? (
        <MediaView
          media={data.media}
          context={context}
          ratio="4 / 3"
          seed={section.id}
          feature
        />
      ) : null}
    </div>
  );
}

function Announcement({ section, context }: Props<"announcement">) {
  const { data, variant } = section;
  const date = data.date ? siteDate(data.date, context.locale) : null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-6 gap-y-4",
        variant === "card" && "site-card p-6 @3xl/site:p-8",
      )}
    >
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--s-fg)_12%,transparent)]"
      >
        <Megaphone className="size-5 rtl:-scale-x-100" />
      </span>
      <p className="me-auto text-lg leading-snug font-semibold">
        {date ? (
          <span className="site-muted me-3 font-medium">{date}</span>
        ) : null}
        {data.text}
      </p>
      <Actions actions={data.actions} context={context} />
    </div>
  );
}

function Welcome({ section, context }: Props<"welcome">) {
  const { data, variant } = section;
  const signature = (
    <p className="mt-4 grid gap-0.5 border-s-2 border-[var(--s-link)] ps-4">
      <span className="site-heading text-lg">{data.name}</span>
      <span className="site-muted text-sm">{data.role}</span>
    </p>
  );
  if (variant === "letter")
    return (
      <div className="mx-auto grid max-w-3xl gap-6">
        <Heading>{data.heading}</Heading>
        <div className="text-lg">
          <Prose body={data.body} context={context} />
        </div>
        {signature}
      </div>
    );
  return (
    <div className="grid items-center gap-12 @4xl/site:grid-cols-[5fr_7fr] @4xl/site:gap-20">
      <div className={cn(variant === "portraitEnd" && "@4xl/site:order-2")}>
        <Picture
          image={data.portrait}
          context={context}
          ratio="4 / 5"
          seed={section.id}
          feature
          className="max-h-[38rem]"
        />
      </div>
      <div className="grid gap-6">
        <Heading>{data.heading}</Heading>
        <div className="text-lg">
          <Prose body={data.body} context={context} />
        </div>
        {signature}
      </div>
    </div>
  );
}

function Text({ section, context }: Props<"text">) {
  const { data, variant } = section;
  return (
    <div
      className={cn(
        "grid gap-6",
        variant === "narrow" ? "mx-auto max-w-3xl" : "",
      )}
    >
      <Eyebrow>{data.eyebrow}</Eyebrow>
      <Heading>{data.heading}</Heading>
      <div
        className={cn(
          "text-[1.075rem]",
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
        "grid gap-6",
        variant === "overlap" &&
          "site-card relative z-10 p-8 shadow-xl @4xl/site:-ms-28 @4xl/site:p-12",
      )}
      style={variant === "overlap" ? { background: "var(--s-bg)" } : undefined}
    >
      <Eyebrow>{data.eyebrow}</Eyebrow>
      <Heading>{data.heading}</Heading>
      <Prose body={data.body} context={context} />
      <Actions actions={data.actions} context={context} className="mt-1" />
    </div>
  );
  return (
    <div className="grid items-center gap-12 @4xl/site:grid-cols-2 @4xl/site:gap-20">
      <div className={cn(variant === "mediaEnd" && "@4xl/site:order-2")}>
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

const COLUMNS = {
  "2": "@3xl/site:grid-cols-2",
  "3": "@3xl/site:grid-cols-2 @5xl/site:grid-cols-3",
  "4": "@3xl/site:grid-cols-2 @5xl/site:grid-cols-4",
} as const;

function IconTile({ icon }: { icon: IconId }) {
  if (icon === "none") return null;
  return (
    <span className="grid size-12 place-items-center rounded-[max(var(--s-radius),0.75rem)] bg-[color-mix(in_srgb,var(--s-link)_14%,transparent)] text-[var(--s-link)]">
      <SiteIcon icon={icon} className="size-6" />
    </span>
  );
}

function Cards({ section, context }: Props<"cards">) {
  const { data, variant } = section;
  const center = section.style.align === "center";
  return (
    <div>
      <SectionIntro heading={data.heading} text={data.text} center={center} />
      <ul
        data-stagger
        className={cn(
          variant === "scroller"
            ? "-mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4 @3xl/site:-mx-8 @3xl/site:px-8 [&>li]:w-[min(22rem,80cqi)] [&>li]:shrink-0 [&>li]:snap-start"
            : cn("grid gap-6", COLUMNS[data.columns]),
        )}
      >
        {data.items.map((item) => {
          const body =
            variant === "imageButtons" ? (
              <div className="site-zoom relative isolate aspect-[4/5] overflow-hidden rounded-[var(--s-radius)]">
                <Picture
                  image={item.image}
                  context={context}
                  seed={item.id}
                  className="absolute inset-0 -z-10 rounded-none"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/15 to-transparent"
                />
                <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-6 text-start text-white">
                  <span
                    className="site-heading site-h3"
                    style={{ color: "inherit" }}
                  >
                    {item.title}
                  </span>
                  <ArrowUpRight
                    aria-hidden
                    className="size-6 shrink-0 rtl:-scale-x-100"
                  />
                </span>
              </div>
            ) : (
              <div className="site-card flex h-full flex-col overflow-hidden text-start">
                {variant === "grid" || variant === "scroller" ? (
                  <div className="overflow-hidden">
                    <Picture
                      image={item.image}
                      context={context}
                      ratio="3 / 2"
                      seed={item.id}
                      className="rounded-none"
                    />
                  </div>
                ) : null}
                <div className="grid flex-1 content-start gap-3 p-6 @3xl/site:p-7">
                  {variant === "icons" ? <IconTile icon={item.icon} /> : null}
                  <Heading level={3}>{item.title}</Heading>
                  {item.text ? (
                    <p className="site-muted leading-relaxed">{item.text}</p>
                  ) : null}
                  {item.href ? (
                    <span className="site-link mt-auto inline-flex items-center gap-1.5 pt-2 text-sm">
                      {m.siteLearnMore({}, { locale: context.locale })}
                      <Arrow />
                    </span>
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
      <SectionIntro
        heading={data.heading}
        text={data.text}
        center={section.style.align === "center"}
      />
      {variant === "rows" ? (
        <ul data-stagger className="grid gap-5">
          {data.items.map((item) => (
            <li key={item.id}>
              <SiteAnchor
                href={item.href}
                context={context}
                className="site-card site-zoom grid items-center overflow-hidden text-start @3xl/site:grid-cols-[18rem_1fr_auto]"
              >
                <div className="overflow-hidden">
                  <Picture
                    image={item.image}
                    context={context}
                    ratio="16 / 10"
                    seed={item.id}
                    className="rounded-none"
                  />
                </div>
                <div className="grid gap-1.5 p-6 @3xl/site:px-8">
                  <span className="site-eyebrow">{item.ages}</span>
                  <Heading level={3}>{item.title}</Heading>
                  <p className="site-muted">{item.text}</p>
                </div>
                {item.href ? (
                  <Arrow className="me-8 hidden size-6 text-[var(--s-link)] @3xl/site:block" />
                ) : null}
              </SiteAnchor>
            </li>
          ))}
        </ul>
      ) : (
        <ul data-stagger className="grid gap-6 @3xl/site:grid-cols-3">
          {data.items.map((item) => (
            <li key={item.id}>
              <SiteAnchor
                href={item.href}
                context={context}
                className="site-zoom group relative isolate block aspect-[3/4] overflow-hidden rounded-[var(--s-radius)] text-start"
              >
                <Picture
                  image={item.image}
                  context={context}
                  seed={item.id}
                  className="absolute inset-0 -z-10 rounded-none"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
                />
                <div className="absolute inset-x-0 bottom-0 grid gap-1.5 p-7 text-white">
                  <span className="text-sm font-medium opacity-90">
                    {item.ages}
                  </span>
                  <span
                    className="site-heading site-h2"
                    style={{ color: "inherit" }}
                  >
                    {item.title}
                  </span>
                  {item.text ? (
                    <span className="max-w-xs text-sm opacity-90">
                      {item.text}
                    </span>
                  ) : null}
                  {item.href ? (
                    <span className="mt-3 inline-grid size-10 place-items-center rounded-full bg-white text-black transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
                      <Arrow />
                    </span>
                  ) : null}
                </div>
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
    <div className="grid content-start gap-2 border-s border-[var(--s-border)] ps-6">
      <dd
        ref={ref}
        className="site-heading order-1 text-[clamp(2.75rem,1.8rem+3.2cqi,4.5rem)] leading-none font-bold text-[var(--s-link)] tabular-nums"
      >
        {value}
      </dd>
      <dt className="order-2 text-base font-semibold">{label}</dt>
      {caption ? (
        <dd className="site-muted order-3 text-sm">{caption}</dd>
      ) : null}
    </div>
  );
}

function Stats({ section, context }: Props<"stats">) {
  const { data, variant } = section;
  const figures = (
    <dl
      data-stagger
      className={cn(
        "grid gap-x-8 gap-y-12",
        data.items.length > 3
          ? "grid-cols-2 @4xl/site:grid-cols-4"
          : "grid-cols-1 @3xl/site:grid-cols-3",
      )}
    >
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
    <div className="grid gap-12">
      <Heading
        className={
          section.style.align === "center" ? "mx-auto max-w-3xl" : "max-w-3xl"
        }
      >
        {data.heading}
      </Heading>
      {variant === "overImage" ? (
        <div className="grid items-center gap-12 @4xl/site:grid-cols-2 @4xl/site:gap-16">
          <MediaView
            media={data.media}
            context={context}
            ratio="4 / 3"
            seed={section.id}
            feature
          />
          <div className="[&_dl]:grid-cols-2">{figures}</div>
        </div>
      ) : (
        figures
      )}
      {data.source ? <p className="site-muted text-sm">{data.source}</p> : null}
    </div>
  );
}

function Pillars({ section, context }: Props<"pillars">) {
  const { data, variant } = section;
  if (variant === "alternating")
    return (
      <div className="grid gap-20">
        <SectionIntro heading={data.heading} text={data.text} center />
        {data.items.map((item, index) => (
          <div
            key={item.id}
            className="grid items-center gap-10 @4xl/site:grid-cols-2 @4xl/site:gap-20"
          >
            <div className={cn(index % 2 === 1 && "@4xl/site:order-2")}>
              <Picture
                image={item.image}
                context={context}
                ratio="5 / 4"
                seed={item.id}
                feature
              />
            </div>
            <div className="grid gap-4">
              <span className="site-heading text-5xl font-bold text-[var(--s-link)] tabular-nums opacity-30">
                {new Intl.NumberFormat(context.locale, {
                  minimumIntegerDigits: 2,
                }).format(index + 1)}
              </span>
              <Heading>{item.title}</Heading>
              <p className="site-muted text-lg leading-relaxed">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    );
  return (
    <div>
      <SectionIntro
        heading={data.heading}
        text={data.text}
        center={section.style.align === "center"}
      />
      <ol
        data-stagger
        className="grid gap-x-10 gap-y-12 @3xl/site:grid-cols-2 @5xl/site:grid-cols-4"
      >
        {data.items.map((item, index) => (
          <li key={item.id} className="grid content-start gap-4">
            {variant === "numbered" ? (
              <span className="site-heading border-b border-[var(--s-border)] pb-4 text-5xl font-bold text-[var(--s-link)] tabular-nums">
                {new Intl.NumberFormat(context.locale, {
                  minimumIntegerDigits: 2,
                }).format(index + 1)}
              </span>
            ) : (
              <IconTile icon={item.icon} />
            )}
            <Heading level={3}>{item.title}</Heading>
            <p className="site-muted leading-relaxed">{item.text}</p>
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
      {data.role ? (
        <span className="site-muted text-sm">{data.role}</span>
      ) : null}
    </figcaption>
  );
  return (
    <figure
      className={cn(
        "mx-auto grid max-w-5xl gap-8",
        variant === "portrait" &&
          "items-center @3xl/site:grid-cols-[14rem_1fr] @3xl/site:gap-14",
      )}
    >
      {variant === "portrait" ? (
        <Picture
          image={data.portrait}
          context={context}
          ratio="1 / 1"
          seed={section.id}
          className="rounded-full"
        />
      ) : null}
      <div
        className={cn(
          "grid gap-8",
          section.style.align === "center" && "justify-items-center",
        )}
      >
        {variant === "badge" && data.badge !== "none" ? (
          <span className="site-eyebrow rounded-full border border-[var(--s-border)] px-4 py-1.5">
            {BADGE_NAME[data.badge]}
          </span>
        ) : (
          <span
            aria-hidden
            className="site-heading -mb-10 text-[7rem] leading-none text-[var(--s-link)] opacity-80"
          >
            {context.locale === "ar" ? "«" : "“"}
          </span>
        )}
        <blockquote className="site-heading text-[clamp(1.5rem,1rem+2cqi,2.75rem)] leading-[1.25] font-medium">
          {data.quote}
        </blockquote>
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
      <SectionIntro
        heading={data.heading}
        center={section.style.align === "center"}
      />
      {variant === "tabs" && audiences.length > 1 ? (
        <div role="tablist" className="mb-10 flex flex-wrap gap-2">
          {["all", ...audiences].map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "rounded-full border border-[var(--s-border)] px-5 py-2 text-sm font-semibold transition-colors",
                tab === value &&
                  "border-transparent bg-[var(--s-btn)] text-[var(--s-btn-fg)]",
              )}
            >
              {value === "all" ? m.siteAudienceAll({}, t) : audience[value]}
            </button>
          ))}
        </div>
      ) : null}
      <ul
        data-stagger
        className={cn(
          variant === "carousel"
            ? "-mx-5 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-4 @3xl/site:-mx-8 @3xl/site:px-8 [&>li]:w-[min(26rem,85cqi)] [&>li]:shrink-0 [&>li]:snap-start"
            : "grid gap-6 @3xl/site:grid-cols-2 @5xl/site:grid-cols-3",
        )}
      >
        {items.map((item) => (
          <li key={item.id}>
            <figure className="site-card flex h-full flex-col gap-6 p-8 text-start">
              <span
                aria-hidden
                className="site-heading -mb-6 text-6xl leading-none text-[var(--s-link)]"
              >
                {context.locale === "ar" ? "«" : "“"}
              </span>
              <blockquote className="text-lg leading-relaxed">
                {item.quote}
              </blockquote>
              <figcaption className="mt-auto flex items-center gap-3 border-t border-[var(--s-border)] pt-5">
                {item.portrait.fileId ? (
                  <Picture
                    image={item.portrait}
                    context={context}
                    ratio="1 / 1"
                    seed={item.id}
                    className="size-12 shrink-0 rounded-full"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="site-heading grid size-12 shrink-0 place-items-center rounded-full bg-[var(--s-btn)] text-lg text-[var(--s-btn-fg)]"
                  >
                    {item.name.trim().charAt(0)}
                  </span>
                )}
                <span className="grid">
                  <span className="font-semibold">{item.name}</span>
                  <span className="site-muted text-sm">{item.role}</span>
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
      <SectionIntro
        heading={data.heading}
        text={data.text}
        center={section.style.align === "center"}
      />
      <ul
        data-stagger
        className={cn(
          variant === "carousel"
            ? "-mx-5 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-4 @3xl/site:-mx-8 @3xl/site:px-8 [&>li]:w-[min(17rem,70cqi)] [&>li]:shrink-0 [&>li]:snap-start"
            : "grid grid-cols-2 gap-x-6 gap-y-10 @3xl/site:grid-cols-3 @5xl/site:grid-cols-4",
        )}
      >
        {data.items.map((item) => (
          <li key={item.id} className="grid content-start gap-4 text-start">
            <div className="site-feature">
              <Picture
                image={item.portrait}
                context={context}
                ratio="4 / 5"
                seed={item.id}
                className="rounded-none"
              />
            </div>
            <span className="grid gap-0.5">
              <span className="site-heading site-h3">{item.name}</span>
              <span className="site-link text-sm">{item.role}</span>
            </span>
            {item.text ? (
              <p className="site-muted text-sm leading-relaxed">{item.text}</p>
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
      <div className="grid items-center gap-12 @4xl/site:grid-cols-[2fr_3fr] @4xl/site:gap-16">
        <div data-stagger className="grid gap-5">
          <Heading>{data.heading}</Heading>
          <Lead>{data.text}</Lead>
          <Actions actions={data.actions} context={context} />
        </div>
        {player}
      </div>
    );
  return (
    <div
      className={cn("grid gap-10", variant === "inset" && "mx-auto max-w-5xl")}
    >
      <SectionIntro
        heading={data.heading}
        text={data.text}
        center={section.style.align === "center"}
      />
      {player}
      <Actions
        actions={data.actions}
        context={context}
        className={section.style.align === "center" ? "justify-center" : ""}
      />
    </div>
  );
}

function Gallery({ section, context }: Props<"gallery">) {
  const { data, variant } = section;
  return (
    <div>
      <SectionIntro
        heading={data.heading}
        center={section.style.align === "center"}
      />
      <ul
        data-stagger
        className={cn(
          variant === "masonry"
            ? "columns-2 gap-4 @4xl/site:columns-3 [&>li]:mb-4 [&>li]:break-inside-avoid"
            : variant === "carousel"
              ? "-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 @3xl/site:-mx-8 @3xl/site:px-8 [&>li]:w-[min(30rem,85cqi)] [&>li]:shrink-0 [&>li]:snap-start"
              : "grid auto-rows-[minmax(10rem,18cqi)] grid-cols-2 gap-4 @4xl/site:grid-cols-4",
        )}
      >
        {data.items.map((item, index) => (
          <li
            key={item.id}
            className={cn(
              variant === "grid" && index === 0 && "col-span-2 row-span-2",
              variant === "grid" && index === 3 && "@4xl/site:col-span-2",
            )}
          >
            <Picture
              image={item.image}
              context={context}
              seed={item.id}
              ratio={
                variant === "masonry"
                  ? index % 3 === 0
                    ? "3 / 4"
                    : "4 / 3"
                  : variant === "carousel"
                    ? "4 / 3"
                    : undefined
              }
              className={variant === "grid" ? "size-full" : undefined}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Timeline({ section }: Props<"timeline">) {
  const { data, variant } = section;
  return (
    <div>
      <SectionIntro
        heading={data.heading}
        center={section.style.align === "center"}
      />
      <ol
        data-stagger
        className={cn(
          variant === "horizontal"
            ? "flex snap-x gap-10 overflow-x-auto border-t-2 border-[var(--s-border)] pt-10 pb-4 [&>li]:w-72 [&>li]:shrink-0 [&>li]:snap-start"
            : "grid gap-12 border-s-2 border-[var(--s-border)] ps-10",
        )}
      >
        {data.items.map((item) => (
          <li key={item.id} className="relative grid gap-2 text-start">
            <span
              aria-hidden
              className={cn(
                "absolute size-4 rounded-full border-4 border-[var(--s-bg)] bg-[var(--s-link)] outline-2 outline-[var(--s-link)]",
                variant === "horizontal"
                  ? "start-0 -top-[3.1rem]"
                  : "-start-[3.1rem] top-2",
              )}
            />
            <span className="site-heading text-3xl font-bold text-[var(--s-link)]">
              {item.year}
            </span>
            <span className="site-heading site-h3">{item.title}</span>
            <p className="site-muted leading-relaxed">{item.text}</p>
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
        <SectionIntro
          heading={data.heading}
          text={data.text}
          center={section.style.align === "center"}
        />
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
          className="max-w-3xl text-lg leading-relaxed whitespace-pre-line"
        >
          {data.items[open]?.text}
        </p>
      </div>
    );
  return (
    <div
      className={cn(
        variant === "columns"
          ? "grid gap-12 @4xl/site:grid-cols-[2fr_3fr] @4xl/site:gap-20"
          : "mx-auto max-w-3xl",
      )}
    >
      <SectionIntro heading={data.heading} text={data.text} />
      <div className="divide-y divide-[var(--s-border)] border-y border-[var(--s-border)]">
        {data.items.map((item) => (
          <details key={item.id} className="group py-6 text-start">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-semibold [&::-webkit-details-marker]:hidden">
              {item.title}
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--s-border)] text-xl leading-none transition-transform duration-300 group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="site-muted mt-4 max-w-2xl leading-relaxed whitespace-pre-line">
              {item.text}
            </p>
          </details>
        ))}
      </div>
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
        <Picture
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
  if (variant === "marquee")
    return (
      <div className="grid gap-10">
        <Heading level={3} className="text-center">
          {data.heading}
        </Heading>
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
      <Heading level={3} className="text-center">
        {data.heading}
      </Heading>
      <ul
        data-stagger
        className={cn(
          variant === "grid"
            ? "grid grid-cols-2 gap-8 @3xl/site:grid-cols-4"
            : "flex flex-wrap items-center justify-center gap-x-16 gap-y-8",
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
          className={cn("site-media rounded-none", className)}
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
      <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
        <Heading>{data.heading}</Heading>
        <SiteAnchor
          href="/news"
          context={context}
          className="site-link inline-flex items-center gap-1.5"
        >
          {m.siteAllNews({}, t)}
          <Arrow />
        </SiteAnchor>
      </div>
      {items.length === 0 ? (
        <p className="site-muted">
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
                <time
                  className="site-muted text-sm"
                  dateTime={item.publishedAt}
                >
                  {siteDate(item.publishedAt, context.locale)}
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
          className={cn(
            "grid gap-6",
            variant === "featured"
              ? "@4xl/site:grid-cols-2"
              : "@3xl/site:grid-cols-2 @5xl/site:grid-cols-3",
          )}
        >
          {items.map((item, index) => {
            const lead = variant === "featured" && index === 0;
            return (
              <li
                key={item.postId}
                className={cn(lead && "@4xl/site:row-span-2")}
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
                  <div className="grid gap-3 p-6 @3xl/site:p-7">
                    <time className="site-eyebrow" dateTime={item.publishedAt}>
                      {siteDate(item.publishedAt, context.locale)}
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
                      <span className="site-muted leading-relaxed">
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

function Events({ section, context }: Props<"events">) {
  const { data, variant } = section;
  const dayMonth = (date: string) => {
    if (!date) return { day: "", month: "" };
    const at = new Date(`${date}T00:00:00Z`);
    return {
      day: new Intl.DateTimeFormat(context.locale, {
        day: "numeric",
        timeZone: "UTC",
      }).format(at),
      month: new Intl.DateTimeFormat(context.locale, {
        month: "short",
        timeZone: "UTC",
      }).format(at),
    };
  };
  return (
    <div>
      <SectionIntro
        heading={data.heading}
        center={section.style.align === "center"}
      />
      <ul
        data-stagger
        className={cn(
          variant === "cards"
            ? "grid gap-6 @3xl/site:grid-cols-2 @5xl/site:grid-cols-3"
            : "grid gap-3",
        )}
      >
        {data.items.map((item) => {
          const { day, month } = dayMonth(item.date);
          return (
            <li key={item.id}>
              <SiteAnchor
                href={item.href}
                context={context}
                className={cn(
                  "site-card group flex items-center gap-6 p-5 text-start",
                  variant === "cards" && "h-full flex-col items-start p-7",
                )}
              >
                <span className="grid min-w-[4.5rem] place-items-center rounded-[max(var(--s-radius),0.75rem)] bg-[var(--s-btn)] px-3 py-3 text-[var(--s-btn-fg)]">
                  <span
                    className="site-heading text-3xl leading-none font-bold"
                    style={{ color: "inherit" }}
                  >
                    {day}
                  </span>
                  <span className="text-xs font-bold tracking-wider uppercase">
                    {month}
                  </span>
                </span>
                <span className="grid flex-1 gap-1">
                  <span className="site-heading site-h3">{item.title}</span>
                  {item.location ? (
                    <span className="site-muted inline-flex items-center gap-1.5 text-sm">
                      <MapPin aria-hidden className="size-4" />
                      {item.location}
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

function Admissions({ section, context }: Props<"admissions">) {
  const { data, variant } = section;
  const date = data.date ? siteDate(data.date, context.locale) : null;
  if (variant === "banner" || variant === "keyDate")
    return (
      <div className="grid items-center gap-10 @4xl/site:grid-cols-[1fr_auto]">
        <div data-stagger className="grid max-w-3xl gap-4">
          {variant === "keyDate" && date ? (
            <span className="site-eyebrow">{date}</span>
          ) : null}
          <Heading size="display">{data.heading}</Heading>
          <Lead className="text-[1.15rem]">{data.text}</Lead>
        </div>
        <Actions
          actions={data.items.flatMap((item) => item.actions)}
          context={context}
        />
      </div>
    );
  return (
    <div>
      <SectionIntro heading={data.heading} text={data.text} center />
      <ol data-stagger className="grid gap-6 @3xl/site:grid-cols-3">
        {data.items.map((item, index) => (
          <li
            key={item.id}
            className="site-card relative grid content-between gap-8 p-8 text-start"
          >
            <div className="grid gap-3">
              <span className="site-heading text-5xl font-bold text-[var(--s-link)] tabular-nums opacity-40">
                {new Intl.NumberFormat(context.locale).format(index + 1)}
              </span>
              <Heading level={3}>{item.title}</Heading>
              <p className="site-muted leading-relaxed">{item.text}</p>
            </div>
            <Actions actions={item.actions} context={context} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Steps({ section, context }: Props<"steps">) {
  const { data, variant } = section;
  const number = (index: number) =>
    new Intl.NumberFormat(context.locale).format(index + 1);
  return (
    <div>
      <SectionIntro
        heading={data.heading}
        text={data.text}
        center={section.style.align === "center"}
      />
      <ol
        data-stagger
        className={cn(
          variant === "horizontal"
            ? "grid gap-10 @3xl/site:grid-cols-2 @5xl/site:grid-cols-4"
            : "mx-auto grid max-w-3xl gap-0",
        )}
      >
        {data.items.map((item, index) => (
          <li
            key={item.id}
            className={cn(
              "relative grid content-start gap-4 text-start",
              variant === "horizontal"
                ? "@5xl/site:after:absolute @5xl/site:after:start-16 @5xl/site:after:top-7 @5xl/site:after:h-px @5xl/site:after:w-[calc(100%-3rem)] @5xl/site:after:bg-[var(--s-border)] @5xl/site:last:after:hidden"
                : "grid-cols-[3.5rem_1fr] gap-6 pb-10 before:absolute before:start-7 before:top-14 before:bottom-0 before:w-px before:bg-[var(--s-border)] last:before:hidden",
            )}
          >
            <span className="relative z-10 grid size-14 place-items-center rounded-full bg-[var(--s-btn)] text-xl font-bold text-[var(--s-btn-fg)]">
              {number(index)}
            </span>
            <span className="grid gap-1.5">
              <span className="site-heading site-h3">{item.title}</span>
              <span className="site-muted leading-relaxed">{item.text}</span>
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
    <div className="mx-auto grid max-w-4xl gap-8">
      <SectionIntro heading={data.heading} text={data.text} />
      {variant === "table" ? (
        <div className="site-card overflow-x-auto">
          <table className="w-full text-start">
            <tbody className="divide-y divide-[var(--s-border)]">
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row" className="p-5 text-start font-semibold">
                    {item.label}
                    {item.note ? (
                      <span className="site-muted block text-sm font-normal">
                        {item.note}
                      </span>
                    ) : null}
                  </th>
                  <td className="site-heading p-5 text-end text-xl tabular-nums">
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
    <div
      className={cn(
        "grid gap-12",
        variant === "map" &&
          "items-center @4xl/site:grid-cols-2 @4xl/site:gap-16",
      )}
    >
      <div className="grid content-start gap-6">
        <Heading>{data.heading}</Heading>
        <Lead>{data.text}</Lead>
        <div className="text-lg">
          <ContactList context={context} />
        </div>
        {data.mapHref ? (
          <SiteAnchor
            href={data.mapHref}
            context={context}
            className="site-button justify-self-start"
          >
            <Link2 aria-hidden className="size-4" />
            {m.siteOpenMap({}, t)}
          </SiteAnchor>
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
            <span className="grid size-16 place-items-center rounded-full bg-[var(--s-canvas)] text-[var(--s-primary)] shadow-xl">
              <MapPin aria-hidden className="size-8" />
            </span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

type FormState = "idle" | "sending" | "sent" | "failed" | "limited";

/**
 * An enquiry form. It sends only from a published page; in the builder it
 * shows what visitors will fill in.
 */
function EnquiryForm({ section, context }: Props<"form">) {
  const { data, variant } = section;
  const t = { locale: context.locale };
  const opened = useRef(0);
  const [state, setState] = useState<FormState>("idle");
  // Uncontrolled inputs keep what someone typed before the page hydrated,
  // and sending waits for hydration so nothing posts natively.
  const hydrated = useHydrated();
  useEffect(() => {
    opened.current = Date.now();
  }, []);
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (context.editing || state === "sending") return;
    const form = new FormData(event.currentTarget);
    const read = (key: string) => {
      const value = form.get(key);
      return typeof value === "string" ? value : "";
    };
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
          childYear: read("childYear"),
          message: read("message"),
          website: read("website"),
          elapsed: Date.now() - opened.current,
        },
      });
      setState("sent");
    } catch (error) {
      setState(
        error instanceof Error && error.message === "site.too_many"
          ? "limited"
          : "failed",
      );
    }
  };
  const id = (name: string) => `${section.id}-${name}`;
  const optional = (
    <span className="site-muted font-normal"> {m.siteFormOptional({}, t)}</span>
  );
  const words = (
    <div data-stagger className="grid content-start gap-5">
      <Eyebrow>{data.eyebrow}</Eyebrow>
      <Heading>{data.heading}</Heading>
      <Lead>{data.text}</Lead>
    </div>
  );
  const form =
    state === "sent" ? (
      <output className="site-card grid content-center justify-items-start gap-4 p-8">
        <span className="grid size-12 place-items-center rounded-full bg-[var(--s-btn)] text-[var(--s-btn-fg)]">
          <Check aria-hidden className="size-6" />
        </span>
        <span className="site-heading site-h3">{data.thanks}</span>
      </output>
    ) : (
      <form
        onSubmit={(event) => void send(event)}
        className={cn(
          "grid gap-4",
          variant === "card" && "site-card p-6 @3xl/site:p-8",
        )}
        noValidate={false}
      >
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
          <label htmlFor={id("email")} className="site-label">
            {m.siteFormEmail({}, t)}
            <input
              id={id("email")}
              className="site-input"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              dir="ltr"
              name="email"
              disabled={context.editing}
            />
          </label>
          {data.phone === "hide" ? null : (
            <label htmlFor={id("phone")} className="site-label">
              <span>
                {m.siteFormPhone({}, t)}
                {data.phone === "ask" ? optional : null}
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
        </div>
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
        {state === "failed" || state === "limited" ? (
          <p role="alert" className="text-sm font-semibold text-[#B42318]">
            {state === "limited"
              ? m.siteFormTooMany({}, t)
              : m.siteFormFailed({}, t)}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            className="site-button"
            disabled={!hydrated || state === "sending" || context.editing}
          >
            {state === "sending"
              ? m.siteFormSending({}, t)
              : data.submit || m.siteFormSend({}, t)}
          </button>
          <p className="site-muted text-sm">
            {context.editing
              ? m.siteFormPreview({}, t)
              : m.siteFormPrivacy({}, t)}
          </p>
        </div>
      </form>
    );
  if (variant === "split")
    return (
      <div className="grid items-start gap-12 @4xl/site:grid-cols-[2fr_3fr] @4xl/site:gap-16">
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
    <div className="relative mx-auto grid max-w-3xl gap-10">
      <div className="text-center [&_.site-eyebrow]:mx-auto">{words}</div>
      {form}
    </div>
  );
}

function QuickLinks({ section, context }: Props<"quickLinks">) {
  const { data, variant } = section;
  return (
    <div>
      <SectionIntro
        heading={data.heading}
        center={section.style.align === "center"}
      />
      <ul
        data-stagger
        className={cn(
          variant === "list"
            ? "grid gap-3 @3xl/site:grid-cols-2"
            : "grid grid-cols-2 gap-4 @3xl/site:grid-cols-4",
        )}
      >
        {data.items.map((item) => (
          <li key={item.id}>
            <SiteAnchor
              href={item.href}
              context={context}
              className={cn(
                "site-card group flex h-full gap-4 p-6 text-start",
                variant === "list" ? "items-center" : "flex-col",
                variant === "audience" && "min-h-44 justify-end",
              )}
              style={
                variant === "audience"
                  ? {
                      background: "var(--s-btn)",
                      color: "var(--s-btn-fg)",
                      borderColor: "transparent",
                    }
                  : undefined
              }
            >
              <SiteIcon
                icon={item.icon}
                className={cn(
                  "size-8",
                  variant === "audience" ? "" : "text-[var(--s-link)]",
                )}
              />
              <span className="grid flex-1 gap-1">
                <span className="text-lg font-semibold">{item.title}</span>
                {item.text ? (
                  <span className="text-sm opacity-80">{item.text}</span>
                ) : null}
              </span>
              <Arrow
                className={cn(
                  "transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1",
                  variant === "list" ? "" : "self-end",
                )}
              />
            </SiteAnchor>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Embed({ section }: Props<"embed">) {
  const { data } = section;
  return (
    <div className="mx-auto grid max-w-4xl gap-8">
      <Heading>{data.heading}</Heading>
      {data.embed ? (
        <div className="site-feature">
          <ContentView
            document={embedDocument(data.embed.provider, data.embed.embedId)}
          />
        </div>
      ) : null}
    </div>
  );
}

const LAYOUT: Record<string, string> = {
  "1-1": "@3xl/site:grid-cols-2",
  "2-1": "@4xl/site:grid-cols-[2fr_1fr]",
  "1-2": "@4xl/site:grid-cols-[1fr_2fr]",
  "1-1-1": "@3xl/site:grid-cols-3",
  "1-1-1-1": "@3xl/site:grid-cols-2 @5xl/site:grid-cols-4",
  "1": "mx-auto max-w-3xl",
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
      return (
        <div className="text-[1.075rem]">
          <Prose body={block.data.body} context={context} />
        </div>
      );
    case "image": {
      const { image, shape, ratio } = block.data;
      const picture = (
        <Picture
          image={image}
          context={context}
          seed={block.id}
          ratio={RATIO[ratio]}
          className={cn(
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
              <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--s-link)_14%,transparent)] text-[var(--s-link)]">
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
        center={section.style.align === "center"}
      />
      <div
        data-stagger
        className={cn(
          "grid gap-12 @4xl/site:gap-16",
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

const EDGE_TO_EDGE = new Set<PageSection["type"]>(["hero", "slides"]);

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
  const full =
    EDGE_TO_EDGE.has(section.type) && section.variant === "fullbleed";
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
