import type { CSSProperties, ReactNode } from "react";

import { Button, buttonVariants } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@faridalms/ui/sheet";
import { ThemeToggle } from "@faridalms/ui/system/theme-toggle";
import { Link } from "@tanstack/react-router";
import {
  ArchiveRestore,
  ArrowUpRight,
  Check,
  ChevronsLeftRight,
  Code2,
  GraduationCap,
  History,
  LockKeyhole,
  Menu,
  Play,
  ServerCog,
  X,
} from "lucide-react";
import { useState } from "react";

import * as m from "~/i18n/messages";
import { getLocale, setLocale } from "~/i18n/runtime";
import { formatNumber } from "~/utils/datetime";

import { DemoForm } from "./DemoForm";
import { GUIDE, SECURITY, SOURCE } from "./links";
import { Switchboard } from "./Switchboard";

// The guide's own commands, quoted as it gives them.
const QUICK_START = [
  'curl -fsSLO "$base/compose.yaml"',
  'curl -fsSL "$base/env.example" -o .env',
  "docker compose up -d",
];

const CONTAINER = "mx-auto w-full max-w-6xl px-5 sm:px-6";
const SECTION = "scroll-mt-16 py-20 sm:py-28";
const HEADING =
  "product-display text-3xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-[2.75rem]";

const EYEBROW =
  "text-xs font-semibold tracking-wider text-primary uppercase rtl:tracking-normal";

const CHIP =
  "shrink-0 rounded-full border bg-card px-3 py-1 text-xs font-medium text-foreground";

type Shown = "en" | "ar";

const shown = (): Shown => (getLocale() === "ar" ? "ar" : "en");

interface SectionHeadingProps {
  id: string;
  title: string;
  body?: string;
  className?: string;
}

function SectionHeading({ id, title, body, className }: SectionHeadingProps) {
  return (
    <div className={cn("max-w-2xl", className)}>
      <h2 id={id} className={HEADING}>
        {title}
      </h2>
      {body ? (
        <p className="mt-5 text-lg leading-relaxed text-pretty text-muted-foreground">
          {body}
        </p>
      ) : null}
    </div>
  );
}

interface StarProps {
  className?: string;
}

function Star({ className }: StarProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M12 2.1 14.9 5h4.1v4.1L21.9 12 19 14.9V19h-4.1L12 21.9 9.1 19H5v-4.1L2.1 12 5 9.1V5h4.1z" />
    </svg>
  );
}

interface BrandProps {
  className?: string;
}

function Brand({ className }: BrandProps) {
  return (
    <span className={cn("flex items-center gap-2.5 font-semibold", className)}>
      <span className="grid size-8 place-items-center rounded-lg bg-brand-accent text-brand">
        <GraduationCap aria-hidden className="size-[1.15rem]" />
      </span>
      {m.appName()}
    </span>
  );
}

interface LanguageSwitchProps {
  className?: string;
}

/** Switches straight to the other language, named in its own script. */
function LanguageSwitch({ className }: LanguageSwitchProps) {
  const other: Shown = shown() === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      lang={other}
      onClick={() => {
        void setLocale(other);
      }}
      className={cn(
        "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-brand-accent/50",
        className,
      )}
    >
      {other === "ar" ? m.languageOwnAr() : m.languageOwnEn()}
    </button>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: "#fit", label: m.productNavFit() },
    { href: "#who", label: m.productNavWho() },
    { href: "#day", label: m.productNavDay() },
    { href: "#modules", label: m.productNavModules() },
    { href: "#languages", label: m.productNavLanguages() },
    { href: "#security", label: m.productNavTrust() },
  ];
  return (
    <header className="school-sidebar sticky top-0 z-40 border-b border-white/10 bg-brand/95 backdrop-blur supports-[backdrop-filter]:bg-brand/85">
      <div className={cn(CONTAINER, "flex h-16 items-center gap-4")}>
        <a
          href="#top"
          className="shrink-0 rounded-md whitespace-nowrap text-white outline-none focus-visible:ring-3 focus-visible:ring-brand-accent/50"
        >
          <Brand />
        </a>
        <nav aria-label={m.productNavLabel()} className="hidden xl:block">
          <ul className="flex">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-md px-2.5 py-2 text-sm whitespace-nowrap text-brand-soft outline-none hover:bg-white/10 hover:text-white focus-visible:ring-3 focus-visible:ring-brand-accent/50"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {/* The theme menu draws its trigger in the app's muted tokens;
            here they are the green band's own. */}
        <div className="ms-auto flex items-center gap-1 [--foreground:#fff] [--muted-foreground:var(--brand-soft)] [--muted:rgb(255_255_255/0.1)] [--ring:var(--brand-accent)]">
          <LanguageSwitch className="text-brand-soft hover:bg-white/10 hover:text-white" />
          <ThemeToggle />
          <Link
            to="/sign-in"
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "hidden text-brand-foreground hover:bg-white/10 hover:text-white sm:inline-flex",
            )}
          >
            {m.productSignIn()}
          </Link>
          <a
            href="#demo"
            className={cn(
              buttonVariants(),
              "ms-1 hidden bg-brand-accent px-4 text-brand hover:bg-brand-accent-hover sm:inline-flex",
            )}
          >
            {m.productRequestDemo()}
          </a>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={m.productMenuOpen()}
                  className="text-brand-foreground hover:bg-white/10 hover:text-white xl:hidden"
                />
              }
            >
              <Menu aria-hidden className="size-5" />
            </SheetTrigger>
            <SheetContent
              side="top"
              showCloseButton={false}
              className="product-site gap-0 p-0"
            >
              <div className="flex h-16 items-center justify-between border-b px-5">
                <SheetTitle className="font-semibold">
                  {m.productMenuTitle()}
                </SheetTitle>
                <SheetClose
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={m.productMenuClose()}
                    />
                  }
                >
                  <X aria-hidden className="size-5" />
                </SheetClose>
              </div>
              <nav aria-label={m.productNavLabel()} className="px-3 py-3">
                <ul className="grid">
                  {links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="flex h-12 items-center rounded-md px-3 text-base font-medium hover:bg-muted"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="grid gap-2 border-t p-5 sm:grid-cols-2">
                <Link
                  to="/sign-in"
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  {m.productSignIn()}
                </Link>
                <a
                  href="#demo"
                  onClick={() => setOpen(false)}
                  className={buttonVariants({ size: "lg" })}
                >
                  {m.productRequestDemo()}
                </a>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

/**
 * One timetable photographed in both languages, the English picture under
 * the Arabic one. The range input decides where the Arabic picture starts,
 * so a pointer, a finger and the arrow keys all move the same divider. The
 * pictures are physical, so the frame keeps left to right in either page.
 */
function Compare() {
  const [split, setSplit] = useState(50);
  return (
    <figure>
      <div className="rounded-[1.25rem] border bg-card p-1.5 shadow-[0_24px_64px_-24px_color-mix(in_srgb,var(--brand-shadow)_45%,transparent)] sm:p-2">
        <div
          dir="ltr"
          className="relative overflow-hidden rounded-xl bg-background"
          style={{ "--split": `${split}%` } as CSSProperties}
        >
          {(["light", "dark"] as const).map((theme) => (
            <div
              key={theme}
              className={
                theme === "light" ? "dark:hidden" : "hidden dark:block"
              }
            >
              <img
                src={`/product/timetable-en-${theme}.webp`}
                alt={m.productHeroShotEnglish()}
                width={2240}
                height={1400}
                loading={theme === "light" ? "eager" : "lazy"}
                fetchPriority={theme === "light" ? "high" : "auto"}
                decoding="async"
                className="block h-auto w-full"
              />
              <img
                src={`/product/timetable-ar-${theme}.webp`}
                alt={m.productHeroShotArabic()}
                width={2240}
                height={1400}
                loading={theme === "light" ? "eager" : "lazy"}
                decoding="async"
                className="absolute inset-0 size-full [clip-path:inset(0_0_0_var(--split))]"
              />
            </div>
          ))}
          <input
            type="range"
            min={0}
            max={100}
            value={split}
            onChange={(event) => setSplit(Number(event.currentTarget.value))}
            aria-label={m.productHeroCompare()}
            aria-valuetext={`${split}%`}
            className="peer absolute inset-0 z-10 size-full cursor-ew-resize appearance-none opacity-0"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 start-[var(--split)] z-20 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_color-mix(in_srgb,var(--brand)_25%,transparent),0_0_24px_color-mix(in_srgb,var(--brand)_35%,transparent)] peer-focus-visible:[&>span]:ring-4 peer-focus-visible:[&>span]:ring-brand-accent"
          >
            <span className="absolute start-1/2 top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand text-white shadow-lg ring-2 ring-white sm:size-11">
              <ChevronsLeftRight className="size-4 sm:size-5" />
            </span>
          </div>
        </div>
      </div>
      <div
        dir="ltr"
        className="mt-4 flex items-start justify-between gap-4 text-sm text-muted-foreground"
      >
        <span aria-hidden lang="en" className={CHIP}>
          {m.languageOwnEn()}
        </span>
        <figcaption dir="auto" className="pt-1 text-center text-pretty">
          {m.productHeroCaption()}
        </figcaption>
        <span aria-hidden lang="ar" className={CHIP}>
          {m.languageOwnAr()}
        </span>
      </div>
    </figure>
  );
}

function Hero() {
  const lines = [
    {
      lang: "en",
      dir: "ltr",
      text: m.productHeroTitleEnglish(),
      className: "text-white",
    },
    {
      lang: "ar",
      dir: "rtl",
      text: m.productHeroTitleArabic(),
      className: "text-brand-accent",
    },
  ] as const;
  const ordered = shown() === "ar" ? lines.toReversed() : lines;
  return (
    <section
      aria-labelledby="hero-title"
      className="relative overflow-hidden bg-[linear-gradient(to_bottom,var(--brand)_0,var(--brand-deep)_calc(100%-16rem),var(--background)_calc(100%-16rem))] text-brand-foreground"
    >
      <div
        aria-hidden
        className="product-lattice pointer-events-none absolute inset-x-0 top-0 h-[46rem] text-white/[0.07] [--lattice-fade:radial-gradient(ellipse_70%_80%_at_50%_0%,#000_20%,transparent_75%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute start-1/2 top-[26rem] h-[30rem] w-[60rem] max-w-[140%] -translate-x-1/2 rounded-full bg-brand-glow/25 blur-[120px] rtl:translate-x-1/2"
      />
      <div className={cn(CONTAINER, "relative pt-16 sm:pt-24")}>
        <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm text-brand-sage">
          <Star className="size-3.5 shrink-0 text-brand-accent" />
          {m.productHeroEyebrow()}
        </p>
        <h1
          id="hero-title"
          className="mt-8 flex flex-col gap-2 font-semibold sm:gap-1"
        >
          {ordered.map((line, index) => (
            <span
              key={line.lang}
              lang={line.lang}
              dir={line.dir}
              className={cn(
                "product-display block max-w-full text-[2.3rem] leading-[1.06] tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.4rem]",
                index === 0 ? "self-start" : "self-end",
                line.className,
              )}
            >
              {line.text}
            </span>
          ))}
        </h1>
        <div className="mt-10 grid gap-8 lg:mt-12 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16">
          <p className="max-w-xl text-lg leading-relaxed text-pretty text-brand-muted">
            {m.productHeroBody()}
          </p>
          <div className="grid gap-4 lg:justify-items-end">
            <div className="flex flex-wrap gap-3">
              <a
                href="#demo"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-11 bg-brand-accent px-6 text-base text-brand hover:bg-brand-accent-hover focus-visible:ring-brand-accent/50",
                )}
              >
                {m.productRequestDemo()}
              </a>
              <a
                href="#fit"
                className={cn(
                  buttonVariants({ size: "lg", variant: "ghost" }),
                  "h-11 border border-white/20 px-6 text-base text-brand-foreground hover:bg-white/10 hover:text-white focus-visible:ring-brand-accent/50",
                )}
              >
                {m.productHeroTry()}
              </a>
            </div>
            <p className="text-sm text-brand-quiet">{m.productHeroNote()}</p>
          </div>
        </div>
        <div id="fit" className="mt-14 scroll-mt-20 sm:mt-16">
          <Switchboard />
        </div>
        <p className="mt-4 flex flex-wrap justify-between gap-x-6 gap-y-1 px-1 text-sm text-muted-foreground">
          <span>{m.productFitCaption()}</span>
          <span>{m.productFitCaptionTry()}</span>
        </p>
      </div>
    </section>
  );
}

function Strip() {
  const facts = [
    [m.productStripOne(), m.productStripOneBody()],
    [m.productStripMix(), m.productStripMixBody()],
    [m.productStripLanguages(), m.productStripLanguagesBody()],
    [m.productStripData(), m.productStripDataBody()],
  ] as const;
  return (
    <div className={cn(CONTAINER, "pt-14")}>
      <ul className="product-reveal grid overflow-hidden rounded-2xl border bg-card sm:grid-cols-2 lg:grid-cols-4">
        {facts.map(([title, body]) => (
          <li key={title} className="-ms-px -mt-px border-s border-t p-6">
            <p className="font-semibold">{title}</p>
            <p className="mt-1 text-sm text-pretty text-muted-foreground">
              {body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PointsProps {
  items: string[];
  className?: string;
}

function Points({ items, className }: PointsProps) {
  return (
    <ul className={cn("grid gap-3", className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
            <Check aria-hidden className="size-3.5" strokeWidth={2.5} />
          </span>
          <span className="text-base leading-snug">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** A drawing of a coding lesson: MicroPython and the micro:bit lights it draws. */
function CodeSketch() {
  const heart = [
    [0, 1, 0, 1, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0],
  ];
  const button = (
    <span className="size-5 rounded-full bg-brand-raised ring-4 ring-brand-edge" />
  );
  return (
    <div aria-hidden dir="ltr" className="grid gap-3">
      <pre className="overflow-hidden rounded-xl bg-black/30 px-4 py-3.5 font-mono text-[13px] leading-6 text-brand-code">
        <span className="text-brand-keyword">from</span> microbit{" "}
        <span className="text-brand-keyword">import</span> *{"\n"}
        display.<span className="text-[#9fd3f0]">show</span>(Image.
        <span className="text-[#f2c98a]">HEART</span>)
      </pre>
      <div className="flex items-center justify-between rounded-xl bg-black/30 px-6 py-5">
        {button}
        <div className="grid grid-cols-5 gap-2">
          {heart.flatMap((row, y) =>
            row.map((lit, x) => (
              <span
                key={`${y}-${x}`}
                className={cn(
                  "size-3 rounded-[3px]",
                  lit
                    ? "bg-[#ff6b5b] shadow-[0_0_10px_#ff6b5b]"
                    : "bg-white/10",
                )}
              />
            )),
          )}
        </div>
        {button}
      </div>
    </div>
  );
}

/** A drawing of a video course: the lesson playing and the ones around it. */
function ReelSketch() {
  const lessons = [
    m.productWhoReel1(),
    m.productWhoReel2(),
    m.productWhoReel3(),
    m.productWhoReel4(),
  ];
  return (
    <div
      aria-hidden
      className="grid gap-4 rounded-xl bg-[linear-gradient(135deg,var(--brand),var(--brand-ink))] p-4 text-white sm:grid-cols-[1.3fr_1fr]"
    >
      <div>
        <div className="grid aspect-video place-items-center rounded-lg bg-[radial-gradient(circle_at_30%_30%,color-mix(in_srgb,var(--brand-glow)_45%,transparent),transparent_60%)] ring-1 ring-white/10">
          <span className="grid size-12 place-items-center rounded-full bg-brand-accent text-brand shadow-[0_0_0_10px_rgb(255_255_255/0.08)]">
            <Play className="size-5 translate-x-0.5 fill-current rtl:-translate-x-0.5 rtl:-scale-x-100" />
          </span>
        </div>
        <div className="mt-3 h-1 rounded-full bg-white/15">
          <div className="h-full w-[38%] rounded-full bg-brand-accent" />
        </div>
      </div>
      <ol className="grid content-start gap-1.5 text-[13px]">
        {lessons.map((title, index) => (
          <li
            key={title}
            className={cn(
              "rounded-md px-2.5 py-2",
              index === 2
                ? "bg-white/15 font-semibold"
                : "bg-white/5 text-brand-muted",
              index < 2 && "line-through decoration-white/30",
            )}
          >
            {formatNumber(index + 1)} · {title}
          </li>
        ))}
      </ol>
    </div>
  );
}

interface CaseProps {
  kicker: string;
  title: string;
  body: string;
  on: string[];
  off: string[];
  dark?: boolean;
  children: ReactNode;
}

function Case({ kicker, title, body, on, off, dark, children }: CaseProps) {
  return (
    <article
      className={cn(
        "product-reveal flex flex-col overflow-hidden rounded-2xl border p-6 pb-0 sm:p-8 sm:pb-0",
        dark ? "school-sidebar border-white/10" : "bg-card",
      )}
    >
      <p
        className={cn(
          "text-xs font-semibold tracking-wider uppercase rtl:tracking-normal",
          dark ? "text-brand-glow" : "text-primary",
        )}
      >
        {kicker}
      </p>
      <h3
        className={cn(
          "product-display mt-3 text-[1.45rem] leading-snug font-semibold tracking-tight text-balance",
          dark && "text-white",
        )}
      >
        {title}
      </h3>
      <p
        className={cn(
          "mt-3 max-w-xl leading-relaxed text-pretty",
          dark ? "text-brand-muted" : "text-muted-foreground",
        )}
      >
        {body}
      </p>
      <ul className="mt-5 flex flex-wrap gap-1.5 text-[13px] font-medium">
        {on.map((name) => (
          <li
            key={name}
            className={cn(
              "rounded-full px-2.5 py-1",
              dark
                ? "bg-brand-accent/15 text-brand-accent"
                : "bg-primary/10 text-primary",
            )}
          >
            {name}
          </li>
        ))}
        {off.map((name) => (
          <li
            key={name}
            className={cn(
              "rounded-full px-2.5 py-1 line-through",
              dark
                ? "bg-white/5 text-white/45 decoration-white/30"
                : "bg-muted text-muted-foreground/70 decoration-muted-foreground/40",
            )}
          >
            <span className="sr-only">{m.productWhoOff()}: </span>
            {name}
          </li>
        ))}
      </ul>
      <div className="mt-7 grow content-end pb-6 sm:pb-8">{children}</div>
    </article>
  );
}

interface ScreenProps {
  src: string;
  alt: string;
}

/** A screen of the app, cut off at the foot of its card. */
function Screen({ src, alt }: ScreenProps) {
  return (
    <div className="-mb-6 h-60 overflow-hidden rounded-t-xl border border-b-0 sm:-mb-8">
      <img
        src={src}
        alt={alt}
        width={1440}
        height={900}
        loading="lazy"
        decoding="async"
        className="block h-auto w-[150%] max-w-none"
      />
    </div>
  );
}

function Who() {
  const locale = shown();
  return (
    <section id="who" aria-labelledby="who-title" className={SECTION}>
      <div className={CONTAINER}>
        <p className={EYEBROW}>{m.productWhoEyebrow()}</p>
        <SectionHeading
          id="who-title"
          title={m.productWhoTitle()}
          body={m.productWhoBody()}
          className="product-reveal mt-3 max-w-3xl"
        />
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <Case
            kicker={m.productFitExampleSchool()}
            title={m.productWhoSchoolTitle()}
            body={m.productWhoSchoolBody()}
            on={[
              m.moduleSchoolYears(),
              m.moduleGradeLevels(),
              m.moduleHomerooms(),
              m.moduleFamilies(),
              m.moduleTimetable(),
              m.moduleGradebook(),
              m.moduleAdmissions(),
              m.moduleWebsite(),
            ]}
            off={[]}
          >
            <Screen
              src={`/product/register-${locale}.webp`}
              alt={m.productShotRegister()}
            />
          </Case>
          <Case
            dark
            kicker={m.productFitExampleCode()}
            title={m.productWhoCodeTitle()}
            body={m.productWhoCodeBody()}
            on={[
              m.moduleCoding(),
              m.moduleElearning(),
              m.moduleCoursework(),
              m.moduleAttendance(),
              m.moduleGradeLevels(),
            ]}
            off={[m.moduleSchoolYears(), m.moduleHomerooms()]}
          >
            <CodeSketch />
          </Case>
          <Case
            kicker={m.productFitExampleAcademy()}
            title={m.productWhoAcademyTitle()}
            body={m.productWhoAcademyBody()}
            on={[
              m.moduleCoursework(),
              m.moduleAttendance(),
              m.moduleElearning(),
              m.moduleAdmissions(),
              m.moduleWebsite(),
            ]}
            off={[
              m.moduleFamilies(),
              m.moduleGradeLevels(),
              m.moduleTimetable(),
            ]}
          >
            <Screen
              src={`/product/learners-${locale}.webp`}
              alt={m.productWhoShotAcademy()}
            />
          </Case>
          <Case
            kicker={m.productFitExampleVideo()}
            title={m.productWhoVideoTitle()}
            body={m.productWhoVideoBody()}
            on={[
              m.moduleVideo(),
              m.moduleElearning(),
              m.moduleCoursework(),
              m.moduleWebsite(),
            ]}
            off={[
              m.moduleAttendance(),
              m.moduleTimetable(),
              m.moduleSchoolYears(),
            ]}
          >
            <ReelSketch />
          </Case>
        </div>
      </div>
    </section>
  );
}

function Day() {
  const core = m.productFitCore();
  const beats: { at: string; title: string; body: string; needs: string[] }[] =
    [
      {
        at: "07:45",
        title: m.productDayToday(),
        body: m.productDayTodayBody(),
        needs: [core],
      },
      {
        at: "08:00",
        title: m.productDayRegister(),
        body: m.productDayRegisterBody(),
        needs: [m.moduleAttendance()],
      },
      {
        at: "10:30",
        title: m.productDayWork(),
        body: m.productDayWorkBody(),
        needs: [m.moduleCoursework(), m.moduleElearning()],
      },
      {
        at: "15:10",
        title: m.productDayMark(),
        body: m.productDayMarkBody(),
        needs: [m.moduleCoursework(), m.moduleGradebook()],
      },
      {
        at: "16:00",
        title: m.productDayTell(),
        body: m.productDayTellBody(),
        needs: [core, m.moduleFamilies()],
      },
    ];
  return (
    <section
      id="day"
      aria-labelledby="day-title"
      className={cn(SECTION, "border-y bg-muted/50")}
    >
      <div className={CONTAINER}>
        <p className={EYEBROW}>{m.productDayEyebrow()}</p>
        <SectionHeading
          id="day-title"
          title={m.productDayTitle()}
          body={m.productDayBody()}
          className="product-reveal mt-3"
        />
        <ol className="product-reveal mt-12 grid overflow-hidden rounded-2xl border bg-card sm:grid-cols-2 lg:grid-cols-5">
          {beats.map((beat) => (
            <li
              key={beat.at}
              className="-ms-px -mt-px flex flex-col border-s border-t p-6"
            >
              <p
                dir="ltr"
                className="text-start text-sm font-semibold text-primary tabular-nums"
              >
                {beat.at}
              </p>
              <h3 className="mt-3 text-lg font-semibold">{beat.title}</h3>
              <p className="mt-2 grow text-[15px] leading-relaxed text-pretty text-muted-foreground">
                {beat.body}
              </p>
              <p className="mt-5 text-xs text-muted-foreground/80">
                {beat.needs.join(" · ")}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Catalogue() {
  const rules = [
    [m.productRuleOn(), m.productRuleOnBody()],
    [m.productRuleOff(), m.productRuleOffBody()],
    [m.productRuleKept(), m.productRuleKeptBody()],
  ] as const;
  const groups: {
    title: string;
    hint: string;
    items: string[];
    core?: boolean;
  }[] = [
    {
      title: m.productGroupCore(),
      hint: m.productGroupCoreHint(),
      core: true,
      items: [
        m.productCorePeople(),
        m.productCoreClasses(),
        m.productCoreMessages(),
        m.productCoreAnnouncements(),
        m.productCoreCalendar(),
        m.productCoreFiles(),
        m.productCoreConsents(),
        m.productCoreRoles(),
      ],
    },
    {
      title: m.productFitGroupTeaching(),
      hint: m.productGroupTeachingHint(),
      items: [
        m.moduleCoursework(),
        m.moduleElearning(),
        m.moduleAttendance(),
        m.moduleGradebook(),
        m.moduleCoding(),
        m.moduleVideo(),
        m.moduleStandards(),
        m.modulePeerReview(),
      ],
    },
    {
      title: m.productGroupOrganised(),
      hint: m.productGroupOrganisedHint(),
      items: [
        m.moduleSchoolYears(),
        m.moduleGradeLevels(),
        m.moduleHomerooms(),
        m.moduleTimetable(),
        m.moduleFamilies(),
        m.moduleEarlyYears(),
        m.moduleStudentRecords(),
        m.moduleBadges(),
      ],
    },
    {
      title: m.productFitGroupDoor(),
      hint: m.productGroupDoorHint(),
      items: [
        m.moduleWebsite(),
        m.moduleAdmissions(),
        m.moduleCustomDomains(),
        m.moduleSms(),
      ],
    },
  ];
  return (
    <section id="modules" aria-labelledby="modules-title" className={SECTION}>
      <div
        className={cn(
          CONTAINER,
          "grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16",
        )}
      >
        <div className="product-reveal">
          <p className={EYEBROW}>{m.productCatalogueEyebrow()}</p>
          <h2
            id="modules-title"
            className="product-display mt-3 text-3xl leading-[1.12] font-semibold tracking-tight text-balance sm:text-[2.2rem]"
          >
            {m.productCatalogueTitle()}
          </h2>
          <dl className="mt-8 grid gap-5">
            {rules.map(([title, body]) => (
              <div key={title}>
                <dt className="font-semibold">{title}</dt>
                <dd className="mt-1 text-pretty text-muted-foreground">
                  {body}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <ul className="grid gap-3.5">
          {groups.map((group) => (
            <li
              key={group.title}
              className={cn(
                "product-reveal grid gap-5 rounded-2xl border p-6 sm:grid-cols-[11rem_minmax(0,1fr)] sm:p-7",
                group.core ? "school-sidebar border-transparent" : "bg-card",
              )}
            >
              <div>
                <h3 className={cn("font-semibold", group.core && "text-white")}>
                  {group.title}
                </h3>
                <p
                  className={cn(
                    "mt-1 text-sm",
                    group.core ? "text-brand-muted" : "text-muted-foreground",
                  )}
                >
                  {group.hint}
                </p>
              </div>
              <ul
                className={cn(
                  "grid gap-x-6 gap-y-2.5 text-[15px] sm:grid-cols-2",
                  group.core && "text-white",
                )}
              >
                {group.items.map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <Star
                      className={cn(
                        "size-2.5 shrink-0",
                        group.core ? "text-brand-accent" : "text-primary/60",
                      )}
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Bilingual() {
  return (
    <section
      id="languages"
      aria-labelledby="languages-title"
      className={SECTION}
    >
      <div
        className={cn(
          CONTAINER,
          "grid items-center gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]",
        )}
      >
        <div className="product-reveal">
          <SectionHeading
            id="languages-title"
            title={m.productLanguagesTitle()}
            body={m.productLanguagesBody()}
          />
          <Points
            className="mt-9 gap-4"
            items={[
              m.productLanguagesPoint1(),
              m.productLanguagesPoint2(),
              m.productLanguagesPoint3(),
              m.productLanguagesPoint4(),
            ]}
          />
        </div>
        <div className="product-reveal relative">
          <div
            aria-hidden
            className="product-lattice absolute -inset-6 text-primary/15 [--lattice-fade:radial-gradient(closest-side,#000,transparent)]"
          />
          <div className="relative">
            <Compare />
          </div>
        </div>
      </div>
    </section>
  );
}

function Trust() {
  const items = [
    {
      icon: ServerCog,
      title: m.productTrustIsolation(),
      body: m.productTrustIsolationBody(),
    },
    {
      icon: LockKeyhole,
      title: m.productTrustEncryption(),
      body: m.productTrustEncryptionBody(),
    },
    {
      icon: ArchiveRestore,
      title: m.productTrustBackups(),
      body: m.productTrustBackupsBody(),
    },
    {
      icon: History,
      title: m.productTrustHistory(),
      body: m.productTrustHistoryBody(),
    },
  ];
  return (
    <section
      id="security"
      aria-labelledby="security-title"
      className={cn(SECTION, "school-sidebar relative overflow-clip")}
    >
      <div
        aria-hidden
        className="product-lattice pointer-events-none absolute inset-0 text-white/[0.06] [--lattice-fade:radial-gradient(ellipse_60%_90%_at_0%_50%,#000,transparent)] rtl:[--lattice-fade:radial-gradient(ellipse_60%_90%_at_100%_50%,#000,transparent)]"
      />
      <div
        className={cn(
          CONTAINER,
          "relative grid gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
        )}
      >
        <div className="product-reveal">
          <h2 id="security-title" className={HEADING}>
            {m.productTrustTitle()}
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-pretty text-brand-muted">
            {m.productTrustBody()}
          </p>
          <a
            href={SECURITY}
            className="mt-8 inline-flex items-center gap-1.5 rounded-sm font-medium text-brand-accent underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-brand-accent/50"
          >
            {m.productTrustPolicy()}
            <ArrowUpRight aria-hidden className="size-4 rtl:-scale-x-100" />
          </a>
        </div>
        <ul className="product-reveal grid overflow-hidden rounded-2xl border border-white/10 sm:grid-cols-2">
          {items.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="-ms-px -mt-px border-s border-t border-white/10 bg-white/[0.03] p-7"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-brand-accent text-brand">
                <Icon aria-hidden className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
              <p className="mt-2 leading-relaxed text-brand-muted">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function SelfHosting() {
  return (
    <section
      id="self-hosting"
      aria-labelledby="self-hosting-title"
      className={SECTION}
    >
      <div className={CONTAINER}>
        <div className="product-reveal grid items-center gap-10 rounded-3xl border bg-card p-5 sm:p-10 lg:grid-cols-2 lg:gap-14 lg:p-14">
          <div>
            <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <Code2 aria-hidden className="size-5" />
            </span>
            <h2
              id="self-hosting-title"
              className="product-display mt-6 text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {m.productOpenTitle()}
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-pretty text-muted-foreground">
              {m.productOpenBody()}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={GUIDE}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                {m.productOpenGuide()}
              </a>
              <a
                href={SOURCE}
                className={buttonVariants({ variant: "ghost", size: "lg" })}
              >
                {m.productOpenSource()}
                <ArrowUpRight aria-hidden className="rtl:-scale-x-100" />
              </a>
            </div>
          </div>
          <figure className="overflow-hidden rounded-xl bg-brand-ink text-brand-code shadow-xl ring-1 ring-black/10">
            <figcaption className="border-b border-white/10 px-5 py-3 text-xs text-brand-keyword">
              {m.productOpenTerminal()}
            </figcaption>
            <pre
              dir="ltr"
              className="overflow-x-auto p-5 font-mono text-xs leading-7 sm:text-[13px]"
            >
              {QUICK_START.map((line) => (
                <span key={line} className="block">
                  <span aria-hidden className="text-brand-keyword select-none">
                    ${" "}
                  </span>
                  {line}
                </span>
              ))}
            </pre>
          </figure>
        </div>
      </div>
    </section>
  );
}

function Demo() {
  const steps = [
    { title: m.productStep1(), body: m.productStep1Body() },
    { title: m.productStep2(), body: m.productStep2Body() },
    { title: m.productStep3(), body: m.productStep3Body() },
  ];
  return (
    <section
      id="demo"
      aria-labelledby="demo-title"
      className={cn(SECTION, "border-t bg-muted/50")}
    >
      <div
        className={cn(
          CONTAINER,
          "grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16",
        )}
      >
        <div>
          <SectionHeading
            id="demo-title"
            title={m.productDemoTitle()}
            body={m.productDemoBody()}
          />
          <h3 className="mt-12 text-sm font-semibold text-primary">
            {m.productStepsTitle()}
          </h3>
          <ol className="mt-6 grid gap-0">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="relative flex gap-5 pb-8 last:pb-0"
              >
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute start-[1.1875rem] top-11 bottom-1 w-px bg-border"
                  />
                ) : null}
                <span className="grid size-10 shrink-0 place-items-center rounded-full border bg-background text-sm font-semibold text-primary tabular-nums">
                  {formatNumber(index + 1)}
                </span>
                <div className="pt-2">
                  <p className="font-semibold">{step.title}</p>
                  <p className="mt-1 leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <DemoForm />
      </div>
    </section>
  );
}

function Footer() {
  const [year] = useState(() => new Date().getFullYear());
  const columns = [
    {
      title: m.productNavLabel(),
      links: [
        { href: "#fit", label: m.productNavFit() },
        { href: "#who", label: m.productNavWho() },
        { href: "#modules", label: m.productNavModules() },
        { href: "#languages", label: m.productNavLanguages() },
        { href: "#security", label: m.productNavTrust() },
        { href: "#demo", label: m.productRequestDemo() },
      ],
    },
    {
      title: m.productFooterRun(),
      links: [
        { href: GUIDE, label: m.productFooterSelfHost() },
        { href: SOURCE, label: m.productFooterSource() },
        { href: SECURITY, label: m.productFooterSecurity() },
      ],
    },
  ];
  return (
    <footer className="school-sidebar relative overflow-hidden">
      <div className={cn(CONTAINER, "relative pt-16 pb-10")}>
        <div className="grid gap-12 md:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
          <div>
            <Brand className="text-white" />
            <p className="mt-4 max-w-xs leading-relaxed text-brand-muted">
              {m.productFooterTagline()}
            </p>
            <Link
              to="/sign-in"
              className="mt-6 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-brand-accent underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-brand-accent/50"
            >
              {m.productHeroSecondary()}
            </Link>
          </div>
          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="text-sm font-semibold text-white">{column.title}</p>
              <ul className="mt-4 grid gap-3 text-sm">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="rounded-sm text-brand-muted outline-none hover:text-white focus-visible:ring-3 focus-visible:ring-brand-accent/50"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="mt-14 border-t border-white/10 pt-6 text-sm text-brand-quiet">
          {m.commonCopyRights({ year })} · {m.productFooterLicence()}
        </p>
      </div>
      <div
        aria-hidden
        dir="ltr"
        className="pointer-events-none -mt-6 flex items-end justify-between gap-[4vw] px-5 leading-none font-semibold text-brand-faint select-none sm:px-6"
      >
        <span lang="en" className="text-[19vw] tracking-[-0.05em]">
          {m.productWordmarkEnglish()}
        </span>
        <span
          lang="ar"
          className="product-display translate-y-[0.18em] text-[19vw] leading-none"
        >
          {m.productWordmarkArabic()}
        </span>
      </div>
    </footer>
  );
}

/** The platform's own site on its bare domain: what Farida is, and the way in. */
export function ProductSite() {
  return (
    <div
      id="top"
      className="product-site min-h-screen overflow-x-clip bg-background text-foreground"
    >
      <a
        href="#main"
        className="sr-only start-0 top-0 m-0 focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        {m.navSkipToContent()}
      </a>
      <Header />
      <main id="main">
        <Hero />
        <Strip />
        <Who />
        <Day />
        <Catalogue />
        <Bilingual />
        <Trust />
        <SelfHosting />
        <Demo />
      </main>
      <Footer />
    </div>
  );
}
