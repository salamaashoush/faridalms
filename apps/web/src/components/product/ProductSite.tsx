import type { LucideIcon } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import { Link } from "@tanstack/react-router";
import {
  ArchiveRestore,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronsLeftRight,
  Code2,
  FolderLock,
  GraduationCap,
  History,
  LayoutTemplate,
  LockKeyhole,
  Menu,
  MessagesSquare,
  NotebookTabs,
  School,
  ServerCog,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";

import { ThemeToggle } from "~/components/theme/ThemeToggle";
import * as m from "~/i18n/messages";
import { getLocale, setLocale } from "~/i18n/runtime";
import { formatNumber } from "~/utils/datetime";

import { DemoForm } from "./DemoForm";
import { GUIDE, SECURITY, SOURCE } from "./links";

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

/** Switches straight to the other language, named in its own script. */
interface LanguageSwitchProps {
  className?: string;
}

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
    { href: "#features", label: m.productNavFeatures() },
    { href: "#roles", label: m.productNavRoles() },
    { href: "#languages", label: m.productNavLanguages() },
    { href: "#security", label: m.productNavTrust() },
    { href: "#self-hosting", label: m.productNavSelfHost() },
  ];
  return (
    <header className="school-sidebar sticky top-0 z-40 border-b border-white/10 bg-brand/95 backdrop-blur supports-[backdrop-filter]:bg-brand/85">
      <div className={cn(CONTAINER, "flex h-16 items-center gap-6")}>
        <a
          href="#top"
          className="shrink-0 rounded-md whitespace-nowrap text-white outline-none focus-visible:ring-3 focus-visible:ring-brand-accent/50"
        >
          <Brand />
        </a>
        <nav aria-label={m.productNavLabel()} className="hidden lg:block">
          <ul className="flex gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-md px-3 py-2 text-sm text-brand-soft outline-none hover:bg-white/10 hover:text-white focus-visible:ring-3 focus-visible:ring-brand-accent/50"
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
                  className="text-brand-foreground hover:bg-white/10 hover:text-white lg:hidden"
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
      <div className="rounded-[1.25rem] bg-white/10 p-1.5 shadow-[0_24px_64px_-24px_color-mix(in_srgb,var(--brand-shadow)_45%,transparent)] ring-1 ring-white/15 sm:p-2">
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
      className="relative overflow-hidden bg-[linear-gradient(to_bottom,var(--brand)_0,var(--brand-deep)_calc(100%-14rem),var(--background)_calc(100%-14rem))] text-brand-foreground sm:bg-[linear-gradient(to_bottom,var(--brand)_0,var(--brand-deep)_calc(100%-20rem),var(--background)_calc(100%-20rem))]"
    >
      <div
        aria-hidden
        className="product-lattice pointer-events-none absolute inset-x-0 top-0 h-[44rem] text-white/[0.07] [--lattice-fade:radial-gradient(ellipse_70%_80%_at_50%_0%,#000_20%,transparent_75%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute start-1/2 top-[28rem] h-[30rem] w-[60rem] max-w-[140%] -translate-x-1/2 rounded-full bg-brand-glow/25 blur-[120px] rtl:translate-x-1/2"
      />
      <div className={cn(CONTAINER, "relative pt-16 sm:pt-24")}>
        <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm text-brand-sage">
          <Star className="size-3.5 text-brand-accent" />
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
                "product-display block max-w-full text-[2.1rem] leading-[1.08] tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4rem] xl:text-[4.25rem]",
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
              <Link
                to="/sign-in"
                className={cn(
                  buttonVariants({ size: "lg", variant: "ghost" }),
                  "h-11 border border-white/20 px-6 text-base text-brand-foreground hover:bg-white/10 hover:text-white focus-visible:ring-brand-accent/50",
                )}
              >
                {m.productHeroSecondary()}
              </Link>
            </div>
            <p className="text-sm text-brand-quiet">{m.productHeroNote()}</p>
          </div>
        </div>
        <div className="mt-14 sm:mt-16">
          <Compare />
        </div>
      </div>
    </section>
  );
}

function Modules() {
  const modules = [
    m.productModuleLessons(),
    m.productModuleCoursework(),
    m.productModuleQuizzes(),
    m.productModuleGradebook(),
    m.productModuleExams(),
    m.productModuleAttendance(),
    m.productModuleTimetables(),
    m.productModuleCalendar(),
    m.productModuleAnnouncements(),
    m.productModuleNews(),
    m.productModuleMessages(),
    m.productModuleRecords(),
    m.productModuleConsents(),
    m.productModuleWebsite(),
    m.productModuleCoding(),
  ];
  return (
    <section aria-labelledby="modules-title" className="pt-16 pb-4 sm:pt-20">
      <div className={cn(CONTAINER, "product-reveal text-center")}>
        <h2 id="modules-title" className="text-sm font-semibold text-primary">
          {m.productModulesTitle()}
        </h2>
        <ul className="mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-center gap-x-5 gap-y-2.5 text-lg font-medium text-foreground/80 sm:gap-x-8 sm:gap-y-3 sm:text-2xl">
          {modules.map((name) => (
            <li key={name} className="flex items-center gap-3">
              <Star className="size-2.5 shrink-0 text-primary/50" />
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
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

/** A screen of the app on a pale green panel, bleeding off its far edge. */
interface ShotProps {
  src: string;
  alt: string;
  phone?: boolean;
}

function Shot({ src, alt, phone }: ShotProps) {
  return (
    <div className="workspace-hero relative aspect-[16/10] overflow-hidden rounded-2xl ring-1 ring-black/5 dark:ring-white/10">
      <div
        aria-hidden
        className="product-lattice absolute inset-0 opacity-[0.09] [--lattice-fade:radial-gradient(ellipse_at_center,#000_30%,transparent_80%)]"
      />
      {phone ? (
        <div className="absolute inset-x-0 top-[7%] mx-auto w-[38%] rounded-[2.2rem] bg-neutral-950 p-2 shadow-2xl ring-1 ring-black/20">
          <img
            src={src}
            alt={alt}
            width={780}
            height={1688}
            loading="lazy"
            decoding="async"
            className="block h-auto w-full rounded-[1.7rem]"
          />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          width={1440}
          height={900}
          loading="lazy"
          decoding="async"
          className="absolute start-[6%] top-[8%] h-auto w-[135%] max-w-none rounded-lg shadow-[0_30px_80px_-20px_color-mix(in_srgb,var(--brand-shadow)_45%,transparent)] ring-1 ring-black/10"
        />
      )}
    </div>
  );
}

function Roles() {
  const locale = shown();
  const roles: {
    id: string;
    icon: LucideIcon;
    title: string;
    body: string;
    points: string[];
    shot: string;
    alt: string;
    phone?: boolean;
  }[] = [
    {
      id: "leaders",
      icon: School,
      title: m.productForLeaders(),
      body: m.productForLeadersBody(),
      points: [
        m.productForLeadersPoint1(),
        m.productForLeadersPoint2(),
        m.productForLeadersPoint3(),
      ],
      shot: `/product/record-${locale}.webp`,
      alt: m.productShotRecord(),
    },
    {
      id: "teachers",
      icon: NotebookTabs,
      title: m.productForTeachers(),
      body: m.productForTeachersBody(),
      points: [
        m.productForTeachersPoint1(),
        m.productForTeachersPoint2(),
        m.productForTeachersPoint3(),
      ],
      shot: `/product/register-${locale}.webp`,
      alt: m.productShotRegister(),
    },
    {
      id: "students",
      icon: UserRound,
      title: m.productForStudents(),
      body: m.productForStudentsBody(),
      points: [
        m.productForStudentsPoint1(),
        m.productForStudentsPoint2(),
        m.productForStudentsPoint3(),
      ],
      shot: `/product/student-${locale}.webp`,
      alt: m.productShotStudent(),
    },
    {
      id: "families",
      icon: Users,
      title: m.productForFamilies(),
      body: m.productForFamiliesBody(),
      points: [
        m.productForFamiliesPoint1(),
        m.productForFamiliesPoint2(),
        m.productForFamiliesPoint3(),
      ],
      shot: `/product/family-${locale}.webp`,
      alt: m.productShotFamily(),
      phone: true,
    },
  ];
  return (
    <section id="roles" aria-labelledby="roles-title" className={SECTION}>
      <div className={CONTAINER}>
        <SectionHeading
          id="roles-title"
          title={m.productForTitle()}
          body={m.productForBody()}
          className="product-reveal"
        />
        <Tabs defaultValue="leaders" className="mt-12 gap-10">
          <TabsList className="grid w-full grid-cols-2 gap-1 rounded-xl bg-muted p-1 group-data-horizontal/tabs:h-auto sm:inline-flex sm:w-fit sm:group-data-horizontal/tabs:h-12">
            {roles.map(({ id, icon: Icon, title }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="h-10 flex-none gap-2 rounded-lg px-3 text-sm sm:h-full sm:px-4"
              >
                <Icon aria-hidden />
                {title}
              </TabsTrigger>
            ))}
          </TabsList>
          {roles.map((role) => (
            <TabsContent
              key={role.id}
              value={role.id}
              className="grid items-center gap-10 text-base lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-14"
            >
              <div>
                <h3 className="product-display text-2xl font-semibold tracking-tight">
                  {role.title}
                </h3>
                <p className="mt-3 text-lg leading-relaxed text-pretty text-muted-foreground">
                  {role.body}
                </p>
                <Points items={role.points} className="mt-7" />
              </div>
              <Shot src={role.shot} alt={role.alt} phone={role.phone} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}

interface TileProps {
  icon: LucideIcon;
  title: string;
  body: string;
  className?: string;
  children?: ReactNode;
}

function Tile({ icon: Icon, title, body, className, children }: TileProps) {
  return (
    <article
      className={cn(
        "product-reveal relative flex flex-col overflow-hidden rounded-2xl border bg-card p-6 sm:p-8",
        className,
      )}
    >
      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon aria-hidden className="size-5" />
      </span>
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="mt-2 max-w-md leading-relaxed text-pretty text-muted-foreground">
        {body}
      </p>
      {children}
    </article>
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
    <div aria-hidden dir="ltr" className="mt-8 grid gap-3">
      <pre className="overflow-hidden rounded-xl bg-brand-ink px-4 py-3.5 font-mono text-[13px] leading-6 text-brand-code">
        <span className="text-brand-keyword">from</span> microbit{" "}
        <span className="text-brand-keyword">import</span> *{"\n"}
        display.<span className="text-[#9fd3f0]">show</span>(Image.
        <span className="text-[#f2c98a]">HEART</span>)
      </pre>
      <div className="flex items-center justify-between rounded-xl bg-brand-ink px-6 py-5">
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

function Features() {
  const locale = shown();
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className={cn(SECTION, "border-y bg-muted/50")}
    >
      <div className={CONTAINER}>
        <SectionHeading
          id="features-title"
          title={m.productFeaturesTitle()}
          body={m.productFeaturesBody()}
          className="product-reveal"
        />
        <div className="mt-14 grid gap-4 lg:grid-cols-6">
          <Tile
            icon={BookOpen}
            title={m.productFeatureLearning()}
            body={m.productFeatureLearningBody()}
            className="pb-0 sm:pb-0 lg:col-span-4"
          >
            <div className="relative -me-6 mt-8 h-56 sm:-me-8 sm:h-72">
              <img
                src={`/product/quiz-${locale}.webp`}
                alt={m.productShotQuiz()}
                width={1440}
                height={900}
                loading="lazy"
                decoding="async"
                className="absolute start-0 top-0 h-auto w-[130%] max-w-none rounded-ss-lg border shadow-xl"
              />
            </div>
          </Tile>
          <Tile
            icon={Code2}
            title={m.productFeatureCoding()}
            body={m.productFeatureCodingBody()}
            className="lg:col-span-2"
          >
            <div className="mt-auto">
              <CodeSketch />
            </div>
          </Tile>
          <Tile
            icon={CalendarDays}
            title={m.productFeatureSchoolLife()}
            body={m.productFeatureSchoolLifeBody()}
            className="lg:col-span-2"
          />
          <Tile
            icon={FolderLock}
            title={m.productFeatureRecords()}
            body={m.productFeatureRecordsBody()}
            className="lg:col-span-2"
          />
          <Tile
            icon={MessagesSquare}
            title={m.productFeatureMessages()}
            body={m.productFeatureMessagesBody()}
            className="lg:col-span-2"
          />
          <article className="product-reveal relative grid overflow-hidden rounded-2xl border bg-card lg:col-span-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="p-6 sm:p-8 lg:p-10">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <LayoutTemplate aria-hidden className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">
                {m.productFeatureWebsite()}
              </h3>
              <p className="mt-2 max-w-md leading-relaxed text-pretty text-muted-foreground">
                {m.productFeatureWebsiteBody()}
              </p>
            </div>
            <div className="relative h-72 sm:h-[26rem] lg:h-auto lg:min-h-[26rem]">
              <img
                src={`/product/website-${locale}.webp`}
                alt={m.productShotWebsite()}
                width={1440}
                height={900}
                loading="lazy"
                decoding="async"
                className="absolute start-6 top-6 h-auto w-[115%] max-w-none rounded-ss-lg border shadow-xl sm:start-8 sm:top-8 sm:w-[120%] lg:w-[112%]"
              />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

function Bilingual() {
  const sheets = [
    {
      lang: "en",
      label: m.languageOwnEn(),
      src: "/product/news-en.webp",
      alt: m.productShotNewsEnglish(),
    },
    {
      lang: "ar",
      label: m.languageOwnAr(),
      src: "/product/news-ar.webp",
      alt: m.productShotNewsArabic(),
    },
  ];
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
          <div className="relative grid gap-5">
            {sheets.map((sheet, index) => (
              <figure
                key={sheet.lang}
                className={cn(
                  "overflow-hidden rounded-xl border border-[#e4e4df] bg-white shadow-xl shadow-black/5 dark:border-white/10 dark:shadow-black/30",
                  index === 0 ? "me-8 sm:me-14" : "ms-8 sm:ms-14",
                )}
              >
                <figcaption
                  lang={sheet.lang}
                  className="border-b border-[#ecece7] bg-[#f6f6f2] px-4 py-2 text-xs font-medium text-[#5b6466]"
                >
                  {sheet.label}
                </figcaption>
                <img
                  src={sheet.src}
                  alt={sheet.alt}
                  width={1100}
                  height={525}
                  loading="lazy"
                  decoding="async"
                  className="block h-auto w-full"
                />
              </figure>
            ))}
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
        { href: "#features", label: m.productNavFeatures() },
        { href: "#roles", label: m.productNavRoles() },
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
        <Modules />
        <Roles />
        <Features />
        <Bilingual />
        <Trust />
        <SelfHosting />
        <Demo />
      </main>
      <Footer />
    </div>
  );
}
