import type {
  PageSection,
  SectionOf,
  SiteLocale,
} from "@faridalms/domain/site-sections";

import { Link2, MapPin, Mail, Phone, Quote } from "lucide-react";
import { useState } from "react";

import { ContentView } from "~/components/content/ContentView";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";

import type { RenderContext } from "./parts";

import {
  Actions,
  Eyebrow,
  Heading,
  iconOf,
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

const HEIGHT = {
  s: "min-h-[40cqi]",
  m: "min-h-[52cqi]",
  l: "min-h-[64cqi]",
  screen: "min-h-[100svh]",
} as const;

function Hero({ section, context, first }: Props<"hero">) {
  const { data, variant } = section;
  const hasMedia = Boolean(data.media.fileId) || context.editing;
  const title = <Heading level={first ? 1 : 2}>{data.heading}</Heading>;
  const words = (
    <div
      className={cn(
        "grid gap-5",
        section.style.align === "center" && "justify-items-center",
      )}
    >
      <Eyebrow>{data.eyebrow}</Eyebrow>
      {title}
      <Lead className="max-w-2xl">{data.text}</Lead>
      <Actions actions={data.actions} context={context} className="mt-2" />
    </div>
  );
  if (variant === "fullbleed" && data.media.fileId) {
    const src = context.fileUrl(data.media.fileId);
    return (
      <div
        className={cn(
          "relative isolate flex items-end overflow-hidden rounded-none",
          HEIGHT[data.height],
        )}
        style={{
          ["--s-fg" as string]: "#fff",
          ["--s-heading" as string]: "#fff",
          ["--s-muted" as string]: "rgba(255,255,255,.85)",
          ["--s-btn" as string]: "#fff",
          ["--s-btn-fg" as string]: "#111",
        }}
      >
        {data.media.kind === "video" && src ? (
          <video
            src={src}
            autoPlay
            muted
            loop
            playsInline
            aria-hidden
            className="absolute inset-0 -z-10 size-full object-cover motion-reduce:hidden"
          />
        ) : src ? (
          <img
            src={src}
            alt={data.media.alt}
            className="absolute inset-0 -z-10 size-full object-cover"
          />
        ) : null}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/25 to-black/10"
        />
        <div className="mx-auto w-full max-w-[84rem] px-5 pt-40 pb-14 @3xl/site:px-8 @3xl/site:pb-20">
          {words}
        </div>
      </div>
    );
  }
  if ((variant === "split" || variant === "fullbleed") && hasMedia)
    return (
      <div
        className={cn(
          "grid items-center gap-10 @4xl/site:grid-cols-2 @4xl/site:gap-16",
          HEIGHT[data.height] === HEIGHT.screen && "min-h-[80svh]",
        )}
      >
        {words}
        <MediaView media={data.media} context={context} ratio="4 / 3" />
      </div>
    );
  if (variant === "inset" && hasMedia)
    return (
      <div className="grid justify-items-center gap-10 text-center">
        <div className="grid max-w-3xl justify-items-center gap-5">
          <Eyebrow>{data.eyebrow}</Eyebrow>
          {title}
          <Lead>{data.text}</Lead>
          <Actions
            actions={data.actions}
            context={context}
            className="justify-center"
          />
        </div>
        <div className="w-full max-w-5xl">
          <MediaView media={data.media} context={context} ratio="16 / 9" />
        </div>
      </div>
    );
  return (
    <div className="grid max-w-5xl gap-5 py-[calc(var(--s-space)*0.4)] [&_h1]:text-[clamp(2.75rem,1.5rem+5cqi,6rem)] [&_h1]:leading-[1.02]">
      {words}
    </div>
  );
}

function PageHeader({ section, context, first }: Props<"pageHeader">) {
  const { data, variant } = section;
  return (
    <div
      className={cn(
        "grid items-center gap-8",
        variant === "image" &&
          (data.media.fileId || context.editing) &&
          "@4xl/site:grid-cols-[1.2fr_1fr]",
      )}
    >
      <div className="grid max-w-3xl gap-4">
        <Eyebrow>{data.eyebrow}</Eyebrow>
        <Heading level={first ? 1 : 2}>{data.heading}</Heading>
        <Lead>{data.text}</Lead>
      </div>
      {variant === "image" ? (
        <MediaView media={data.media} context={context} ratio="3 / 2" />
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
        "flex flex-wrap items-center justify-between gap-4",
        variant === "card" && "site-card p-6 @3xl/site:p-8",
      )}
    >
      <p className="text-lg font-semibold">
        {date ? <span className="site-muted me-3">{date}</span> : null}
        {data.text}
      </p>
      <Actions actions={data.actions} context={context} />
    </div>
  );
}

function Welcome({ section, context }: Props<"welcome">) {
  const { data, variant } = section;
  const signature = (
    <p className="mt-6">
      <span className="block font-semibold">{data.name}</span>
      <span className="site-muted">{data.role}</span>
    </p>
  );
  if (variant === "letter")
    return (
      <div className="mx-auto grid max-w-3xl gap-5">
        <Heading>{data.heading}</Heading>
        <Prose body={data.body} context={context} />
        {signature}
      </div>
    );
  return (
    <div className="grid items-center gap-10 @4xl/site:grid-cols-[2fr_3fr] @4xl/site:gap-16">
      <div className={cn(variant === "portraitEnd" && "@4xl/site:order-2")}>
        <Picture
          image={data.portrait}
          context={context}
          ratio="4 / 5"
          className="max-h-[36rem]"
        />
      </div>
      <div className="grid gap-5">
        <Heading>{data.heading}</Heading>
        <Prose body={data.body} context={context} />
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
        "grid gap-5",
        variant === "narrow" ? "mx-auto max-w-3xl" : "",
      )}
    >
      <Eyebrow>{data.eyebrow}</Eyebrow>
      <Heading>{data.heading}</Heading>
      <div
        className={cn(
          variant === "columns" && "@4xl/site:columns-2 @4xl/site:gap-12",
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
      className={cn(
        "grid gap-5",
        variant === "overlap" &&
          "site-card relative z-10 p-8 @4xl/site:-ms-24 @4xl/site:p-12",
      )}
    >
      <Eyebrow>{data.eyebrow}</Eyebrow>
      <Heading>{data.heading}</Heading>
      <Prose body={data.body} context={context} />
      <Actions actions={data.actions} context={context} />
    </div>
  );
  return (
    <div className="grid items-center gap-10 @4xl/site:grid-cols-2 @4xl/site:gap-16">
      <div className={cn(variant === "mediaEnd" && "@4xl/site:order-2")}>
        <MediaView media={data.media} context={context} ratio="4 / 3" />
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

function Cards({ section, context }: Props<"cards">) {
  const { data, variant } = section;
  const center = section.style.align === "center";
  return (
    <div>
      <SectionIntro heading={data.heading} text={data.text} center={center} />
      <ul
        className={cn(
          variant === "scroller"
            ? "flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 [&>li]:w-[min(20rem,80cqi)] [&>li]:shrink-0 [&>li]:snap-start"
            : cn("grid gap-5", COLUMNS[data.columns]),
        )}
      >
        {data.items.map((item) => {
          const Icon = iconOf(item.icon);
          const body =
            variant === "imageButtons" ? (
              <div className="relative isolate aspect-[4/3] overflow-hidden rounded-[var(--s-radius)]">
                <Picture
                  image={item.image}
                  context={context}
                  className="absolute inset-0 -z-10 rounded-none"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 to-transparent"
                />
                <span className="absolute inset-x-0 bottom-0 p-5 text-start text-lg font-semibold text-white">
                  {item.title}
                </span>
              </div>
            ) : (
              <div className="site-card flex h-full flex-col overflow-hidden text-start">
                {variant === "grid" ? (
                  <Picture
                    image={item.image}
                    context={context}
                    ratio="3 / 2"
                    className="rounded-none"
                  />
                ) : null}
                <div className="grid gap-2 p-6">
                  {variant === "icons" && Icon ? (
                    <span className="mb-2 grid size-12 place-items-center rounded-[var(--s-radius)] bg-[color-mix(in_srgb,var(--s-link)_14%,transparent)] text-[var(--s-link)]">
                      <Icon aria-hidden className="size-6" />
                    </span>
                  ) : null}
                  <Heading level={3}>{item.title}</Heading>
                  {item.text ? <p className="site-muted">{item.text}</p> : null}
                </div>
              </div>
            );
          return (
            <li key={item.id}>
              {item.href ? (
                <SiteAnchor
                  href={item.href}
                  context={context}
                  className="block h-full transition-transform hover:-translate-y-0.5"
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
        <ul className="grid gap-4">
          {data.items.map((item) => (
            <li key={item.id}>
              <SiteAnchor
                href={item.href}
                context={context}
                className="site-card grid items-center gap-6 overflow-hidden text-start @3xl/site:grid-cols-[16rem_1fr]"
              >
                <Picture
                  image={item.image}
                  context={context}
                  ratio="16 / 10"
                  className="rounded-none"
                />
                <div className="grid gap-1 p-6 @3xl/site:p-0 @3xl/site:pe-8">
                  <span className="site-eyebrow">{item.ages}</span>
                  <Heading level={3}>{item.title}</Heading>
                  <p className="site-muted">{item.text}</p>
                </div>
              </SiteAnchor>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-5 @3xl/site:grid-cols-3">
          {data.items.map((item) => (
            <li key={item.id}>
              <SiteAnchor
                href={item.href}
                context={context}
                className="group relative isolate block aspect-[3/4] overflow-hidden rounded-[var(--s-radius)] bg-[var(--s-btn)] text-start"
              >
                <Picture
                  image={item.image}
                  context={context}
                  className="absolute inset-0 -z-10 rounded-none transition-transform duration-500 group-hover:scale-105"
                />
                {item.image.fileId ? (
                  <div
                    aria-hidden
                    className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/20 to-transparent"
                  />
                ) : null}
                <div
                  className="absolute inset-x-0 bottom-0 grid gap-1 p-6"
                  style={{
                    color: item.image.fileId ? "#fff" : "var(--s-btn-fg)",
                  }}
                >
                  <span className="text-sm font-medium opacity-85">
                    {item.ages}
                  </span>
                  <span
                    className="site-heading site-h3"
                    style={{ color: "inherit" }}
                  >
                    {item.title}
                  </span>
                  {item.text ? (
                    <span className="text-sm opacity-90">{item.text}</span>
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

function Stats({ section, context }: Props<"stats">) {
  const { data, variant } = section;
  const figures = (
    <dl
      className={cn(
        "grid gap-8",
        data.items.length > 3
          ? "grid-cols-2 @4xl/site:grid-cols-4"
          : "grid-cols-1 @3xl/site:grid-cols-3",
      )}
    >
      {data.items.map((item) => (
        <div key={item.id} className="grid gap-1">
          <dt className="site-heading order-2 text-base font-medium">
            {item.label}
          </dt>
          <dd className="site-heading site-display order-1 font-bold tabular-nums">
            {item.value}
          </dd>
          {variant === "captions" && item.caption ? (
            <dd className="site-muted order-3 text-sm">{item.caption}</dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
  return (
    <div className="grid gap-10">
      <Heading>{data.heading}</Heading>
      {variant === "overImage" && data.media.fileId ? (
        <div className="grid items-center gap-10 @4xl/site:grid-cols-2">
          <MediaView media={data.media} context={context} ratio="4 / 3" />
          {figures}
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
      <div className="grid gap-16">
        <SectionIntro heading={data.heading} text={data.text} center />
        {data.items.map((item, index) => (
          <div
            key={item.id}
            className="grid items-center gap-10 @4xl/site:grid-cols-2"
          >
            <div className={cn(index % 2 === 1 && "@4xl/site:order-2")}>
              <Picture image={item.image} context={context} ratio="4 / 3" />
            </div>
            <div className="grid gap-3">
              <Heading level={3}>{item.title}</Heading>
              <p className="site-muted text-lg">{item.text}</p>
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
      <ol className="grid gap-x-8 gap-y-10 @3xl/site:grid-cols-2 @5xl/site:grid-cols-4">
        {data.items.map((item, index) => (
          <li key={item.id} className="grid content-start gap-3">
            {variant === "numbered" ? (
              <span className="site-heading text-4xl font-bold text-[var(--s-link)] tabular-nums">
                {new Intl.NumberFormat(context.locale)
                  .format(index + 1)
                  .padStart(2, "0")}
              </span>
            ) : (
              <SiteIcon
                icon={item.icon}
                className="size-8 text-[var(--s-link)]"
              />
            )}
            <Heading level={3}>{item.title}</Heading>
            <p className="site-muted">{item.text}</p>
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
        "mx-auto grid max-w-4xl gap-8",
        variant === "portrait" &&
          "items-center @3xl/site:grid-cols-[12rem_1fr]",
      )}
    >
      {variant === "portrait" ? (
        <Picture
          image={data.portrait}
          context={context}
          ratio="1 / 1"
          className="rounded-full"
        />
      ) : null}
      <div className="grid gap-6">
        {variant === "badge" && data.badge !== "none" ? (
          <span className="site-eyebrow justify-self-start rounded-full border border-[var(--s-border)] px-3 py-1">
            {BADGE_NAME[data.badge]}
          </span>
        ) : (
          <Quote
            aria-hidden
            className="size-10 text-[var(--s-link)] rtl:-scale-x-100"
          />
        )}
        <blockquote className="site-heading text-[clamp(1.35rem,1rem+1.5cqi,2.25rem)] leading-snug font-medium">
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
  const AUDIENCE: Record<string, string> = {
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
  const card = (item: (typeof data.items)[number]) => (
    <figure className="site-card flex h-full flex-col gap-6 p-7 text-start">
      <Quote
        aria-hidden
        className="size-6 text-[var(--s-link)] rtl:-scale-x-100"
      />
      <blockquote className="text-lg leading-relaxed">{item.quote}</blockquote>
      <figcaption className="mt-auto flex items-center gap-3">
        {item.portrait.fileId ? (
          <Picture
            image={item.portrait}
            context={context}
            ratio="1 / 1"
            className="size-11 rounded-full"
          />
        ) : null}
        <span className="grid">
          <span className="font-semibold">{item.name}</span>
          <span className="site-muted text-sm">{item.role}</span>
        </span>
      </figcaption>
    </figure>
  );
  return (
    <div>
      <SectionIntro
        heading={data.heading}
        center={section.style.align === "center"}
      />
      {variant === "tabs" && audiences.length > 1 ? (
        <div role="tablist" className="mb-8 flex flex-wrap gap-2">
          {["all", ...audiences].map((audience) => (
            <button
              key={audience}
              type="button"
              role="tab"
              aria-selected={tab === audience}
              onClick={() => setTab(audience)}
              className={cn(
                "rounded-full border border-[var(--s-border)] px-4 py-2 text-sm font-medium",
                tab === audience && "bg-[var(--s-btn)] text-[var(--s-btn-fg)]",
              )}
            >
              {audience === "all"
                ? m.siteAudienceAll({}, t)
                : AUDIENCE[audience]}
            </button>
          ))}
        </div>
      ) : null}
      <ul
        className={cn(
          variant === "carousel"
            ? "flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 [&>li]:w-[min(24rem,85cqi)] [&>li]:shrink-0 [&>li]:snap-start"
            : "grid gap-5 @3xl/site:grid-cols-2 @5xl/site:grid-cols-3",
        )}
      >
        {items.map((item) => (
          <li key={item.id}>{card(item)}</li>
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
        className={cn(
          variant === "carousel"
            ? "flex snap-x snap-mandatory gap-6 overflow-x-auto pb-4 [&>li]:w-[min(16rem,70cqi)] [&>li]:shrink-0 [&>li]:snap-start"
            : "grid grid-cols-2 gap-6 @3xl/site:grid-cols-3 @5xl/site:grid-cols-4",
        )}
      >
        {data.items.map((item) => (
          <li key={item.id} className="grid content-start gap-3 text-start">
            <Picture image={item.portrait} context={context} ratio="4 / 5" />
            <span className="grid">
              <span className="site-heading site-h3">{item.name}</span>
              <span className="site-muted text-sm">{item.role}</span>
            </span>
            {item.text ? (
              <p className="site-muted text-sm">{item.text}</p>
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
    <ContentView
      document={embedDocument(data.embed.provider, data.embed.embedId)}
    />
  ) : (
    <MediaView media={data.media} context={context} ratio="16 / 9" />
  );
  if (variant === "beside")
    return (
      <div className="grid items-center gap-10 @4xl/site:grid-cols-2">
        <div className="grid gap-4">
          <Heading>{data.heading}</Heading>
          <Lead>{data.text}</Lead>
          <Actions actions={data.actions} context={context} />
        </div>
        {player}
      </div>
    );
  return (
    <div
      className={cn("grid gap-8", variant === "inset" && "mx-auto max-w-5xl")}
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
        className={cn(
          variant === "masonry"
            ? "columns-2 gap-4 @4xl/site:columns-3 [&>li]:mb-4 [&>li]:break-inside-avoid"
            : variant === "carousel"
              ? "flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [&>li]:w-[min(28rem,85cqi)] [&>li]:shrink-0 [&>li]:snap-start"
              : "grid grid-cols-2 gap-4 @4xl/site:grid-cols-3",
        )}
      >
        {data.items.map((item) => (
          <li key={item.id}>
            <Picture
              image={item.image}
              context={context}
              ratio={variant === "masonry" ? undefined : "1 / 1"}
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
        className={cn(
          variant === "horizontal"
            ? "flex snap-x gap-8 overflow-x-auto border-t-2 border-[var(--s-border)] pt-8 pb-4 [&>li]:w-64 [&>li]:shrink-0 [&>li]:snap-start"
            : "grid gap-10 border-s-2 border-[var(--s-border)] ps-8",
        )}
      >
        {data.items.map((item) => (
          <li key={item.id} className="relative grid gap-1 text-start">
            <span
              aria-hidden
              className={cn(
                "absolute size-3 rounded-full bg-[var(--s-link)]",
                variant === "horizontal"
                  ? "start-0 -top-[2.45rem]"
                  : "-start-[2.45rem] top-1.5",
              )}
            />
            <span className="site-heading text-2xl font-bold text-[var(--s-link)]">
              {item.year}
            </span>
            <span className="site-heading site-h3">{item.title}</span>
            <p className="site-muted">{item.text}</p>
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
          className="mb-6 flex flex-wrap gap-2 border-b border-[var(--s-border)]"
        >
          {data.items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={open === index}
              onClick={() => setOpen(index)}
              className={cn(
                "-mb-px border-b-2 px-4 py-3 text-sm font-semibold",
                open === index
                  ? "border-[var(--s-link)] text-[var(--s-link)]"
                  : "site-muted border-transparent",
              )}
            >
              {item.title}
            </button>
          ))}
        </div>
        <p role="tabpanel" className="max-w-3xl text-lg whitespace-pre-line">
          {data.items[open]?.text}
        </p>
      </div>
    );
  return (
    <div
      className={cn(
        variant === "columns"
          ? "grid gap-10 @4xl/site:grid-cols-[1fr_2fr]"
          : "mx-auto max-w-3xl",
      )}
    >
      <SectionIntro heading={data.heading} text={data.text} />
      <div className="divide-y divide-[var(--s-border)] border-y border-[var(--s-border)]">
        {data.items.map((item) => (
          <details key={item.id} className="group py-5 text-start">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
              {item.title}
              <span
                aria-hidden
                className="text-2xl leading-none transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="site-muted mt-3 whitespace-pre-line">{item.text}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

function Logos({ section, context }: Props<"logos">) {
  const { data, variant } = section;
  return (
    <div className="grid gap-8">
      <Heading className="text-center">{data.heading}</Heading>
      <ul
        className={cn(
          variant === "grid"
            ? "grid grid-cols-2 gap-6 @3xl/site:grid-cols-4"
            : "flex flex-wrap items-center justify-center gap-x-12 gap-y-6",
        )}
      >
        {data.items.map((item) => (
          <li key={item.id} className="grid place-items-center">
            <SiteAnchor
              href={item.href}
              context={context}
              className="grid place-items-center opacity-80 transition-opacity hover:opacity-100"
            >
              {item.image.fileId || context.editing ? (
                <Picture
                  image={{ ...item.image, alt: item.image.alt || item.name }}
                  context={context}
                  className="h-14 w-auto rounded-none object-contain"
                  ratio={item.image.fileId ? undefined : "2 / 1"}
                />
              ) : (
                <span className="site-heading text-lg">{item.name}</span>
              )}
            </SiteAnchor>
          </li>
        ))}
      </ul>
    </div>
  );
}

const cover = (key: string | null, alt: string, className?: string) =>
  key ? (
    <img
      src={publicMediaUrl(key)}
      alt={alt}
      loading="lazy"
      className={cn("site-media", className)}
    />
  ) : null;

function News({ section, context }: Props<"news">) {
  const { data, variant } = section;
  const t = { locale: context.locale };
  const items = context.news.slice(0, data.count);
  return (
    <div>
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <Heading>{data.heading}</Heading>
        <SiteAnchor href="/news" context={context} className="site-link">
          {m.siteAllNews({}, t)}
        </SiteAnchor>
      </div>
      {items.length === 0 ? (
        <p className="site-muted">
          {context.editing ? m.siteNewsPreview({}, t) : m.siteNoNews({}, t)}
        </p>
      ) : variant === "list" ? (
        <ul className="divide-y divide-[var(--s-border)] border-y border-[var(--s-border)]">
          {items.map((item) => (
            <li key={item.postId}>
              <SiteAnchor
                href={`/news/${item.slug}`}
                context={context}
                className="grid gap-1 py-5 text-start @3xl/site:grid-cols-[10rem_1fr] @3xl/site:gap-8"
              >
                <time
                  className="site-muted text-sm"
                  dateTime={item.publishedAt}
                >
                  {siteDate(item.publishedAt, context.locale)}
                </time>
                <span className="site-heading site-h3">{item.title}</span>
              </SiteAnchor>
            </li>
          ))}
        </ul>
      ) : (
        <ul
          className={cn(
            "grid gap-6",
            variant === "featured"
              ? "@4xl/site:grid-cols-2"
              : "@3xl/site:grid-cols-2 @5xl/site:grid-cols-3",
          )}
        >
          {items.map((item, index) => (
            <li
              key={item.postId}
              className={cn(
                variant === "featured" && index === 0 && "@4xl/site:row-span-2",
              )}
            >
              <SiteAnchor
                href={`/news/${item.slug}`}
                context={context}
                className="site-card flex h-full flex-col overflow-hidden text-start transition-transform hover:-translate-y-0.5"
              >
                {cover(
                  item.coverKey,
                  item.coverAlt,
                  cn(
                    "rounded-none",
                    variant === "featured" && index === 0
                      ? "aspect-[4/3]"
                      : "aspect-[3/2]",
                  ),
                )}
                <div className="grid gap-2 p-6">
                  <time
                    className="site-muted text-sm"
                    dateTime={item.publishedAt}
                  >
                    {siteDate(item.publishedAt, context.locale)}
                  </time>
                  <span className="site-heading site-h3">{item.title}</span>
                  {item.excerpt ? (
                    <span className="site-muted">{item.excerpt}</span>
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
        className={cn(
          variant === "cards"
            ? "grid gap-5 @3xl/site:grid-cols-2 @5xl/site:grid-cols-3"
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
                  "site-card flex items-center gap-5 p-5 text-start",
                  variant === "cards" && "h-full flex-col items-start",
                )}
              >
                <span className="grid min-w-16 place-items-center rounded-[var(--s-radius)] bg-[var(--s-btn)] px-3 py-2 text-[var(--s-btn-fg)]">
                  <span className="text-2xl leading-none font-bold">{day}</span>
                  <span className="text-xs font-semibold uppercase">
                    {month}
                  </span>
                </span>
                <span className="grid gap-0.5">
                  <span className="site-heading site-h3">{item.title}</span>
                  {item.location ? (
                    <span className="site-muted text-sm">{item.location}</span>
                  ) : null}
                </span>
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
      <div className="flex flex-wrap items-center justify-between gap-8">
        <div className="grid max-w-2xl gap-3">
          {variant === "keyDate" && date ? (
            <span className="site-eyebrow">{date}</span>
          ) : null}
          <Heading>{data.heading}</Heading>
          <Lead>{data.text}</Lead>
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
      <ul className="grid gap-5 @3xl/site:grid-cols-3">
        {data.items.map((item) => (
          <li
            key={item.id}
            className="site-card grid content-between gap-6 p-7 text-start"
          >
            <div className="grid gap-2">
              <Heading level={3}>{item.title}</Heading>
              <p className="site-muted">{item.text}</p>
            </div>
            <Actions actions={item.actions} context={context} />
          </li>
        ))}
      </ul>
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
        className={cn(
          variant === "horizontal"
            ? "grid gap-8 @3xl/site:grid-cols-2 @5xl/site:grid-cols-4"
            : "mx-auto grid max-w-3xl gap-8",
        )}
      >
        {data.items.map((item, index) => (
          <li
            key={item.id}
            className={cn(
              "grid gap-3 text-start",
              variant === "vertical" && "grid-cols-[3rem_1fr] items-start",
            )}
          >
            <span className="grid size-12 place-items-center rounded-full bg-[var(--s-btn)] text-lg font-bold text-[var(--s-btn-fg)]">
              {number(index)}
            </span>
            <span className="grid gap-1">
              <span className="site-heading site-h3">{item.title}</span>
              <span className="site-muted">{item.text}</span>
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
    <div className="mx-auto grid max-w-4xl gap-6">
      <SectionIntro heading={data.heading} text={data.text} />
      {variant === "table" ? (
        <div className="site-card overflow-x-auto">
          <table className="w-full text-start">
            <tbody className="divide-y divide-[var(--s-border)]">
              {data.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row" className="p-4 text-start font-medium">
                    {item.label}
                    {item.note ? (
                      <span className="site-muted block text-sm font-normal">
                        {item.note}
                      </span>
                    ) : null}
                  </th>
                  <td className="p-4 text-end font-semibold tabular-nums">
                    {item.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <dl className="grid gap-3">
          {data.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap justify-between gap-4 border-b border-[var(--s-border)] pb-3"
            >
              <dt className="font-medium">{item.label}</dt>
              <dd className="font-semibold tabular-nums">{item.value}</dd>
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
    <ul className="grid gap-3">
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
        "grid gap-10",
        variant === "map" && "@4xl/site:grid-cols-2",
      )}
    >
      <div className="grid content-start gap-5">
        <Heading>{data.heading}</Heading>
        <Lead>{data.text}</Lead>
        <ContactList context={context} />
        {data.mapHref ? (
          <SiteAnchor
            href={data.mapHref}
            context={context}
            className="site-link inline-flex items-center gap-2"
          >
            <Link2 aria-hidden className="size-4" />
            {m.siteOpenMap({}, t)}
          </SiteAnchor>
        ) : null}
      </div>
      {variant === "map" ? (
        <div className="site-card grid min-h-72 place-items-center p-8 text-center">
          <MapPin aria-hidden className="size-10 text-[var(--s-link)]" />
        </div>
      ) : null}
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
        className={cn(
          variant === "list"
            ? "grid gap-2 @3xl/site:grid-cols-2"
            : "grid grid-cols-2 gap-4 @3xl/site:grid-cols-4",
        )}
      >
        {data.items.map((item) => (
          <li key={item.id}>
            <SiteAnchor
              href={item.href}
              context={context}
              className={cn(
                "site-card flex h-full gap-3 p-5 text-start transition-transform hover:-translate-y-0.5",
                variant === "list" ? "items-center" : "flex-col",
                variant === "audience" &&
                  "min-h-40 justify-end bg-[var(--s-btn)] text-[var(--s-btn-fg)]",
              )}
            >
              <SiteIcon
                icon={item.icon}
                className={cn(
                  "size-7",
                  variant === "audience" ? "" : "text-[var(--s-link)]",
                )}
              />
              <span className="grid gap-0.5">
                <span className="font-semibold">{item.title}</span>
                {item.text ? (
                  <span className="text-sm opacity-80">{item.text}</span>
                ) : null}
              </span>
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
    <div className="mx-auto grid max-w-4xl gap-6">
      <Heading>{data.heading}</Heading>
      {data.embed ? (
        <ContentView
          document={embedDocument(data.embed.provider, data.embed.embedId)}
        />
      ) : null}
    </div>
  );
}

const FULL = new Set<PageSection["type"]>(["hero"]);

/**
 * One section as visitors see it. A section shown in the other language
 * carries that language, so screen readers pronounce it right.
 */
export function SiteSection({
  section,
  shownIn,
  context,
  first,
}: {
  section: PageSection;
  shownIn: SiteLocale;
  context: RenderContext;
  first: boolean;
}) {
  const t = { locale: context.locale };
  const full =
    FULL.has(section.type) &&
    section.variant === "fullbleed" &&
    Boolean((section as SectionOf<"hero">).data.media.fileId);
  const body = (() => {
    switch (section.type) {
      case "hero":
        return <Hero section={section} context={context} first={first} />;
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
