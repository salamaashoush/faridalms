import type { LucideIcon } from "lucide-react";

import { buttonVariants } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Link } from "@tanstack/react-router";
import {
  ArchiveRestore,
  BookOpen,
  CalendarDays,
  Check,
  CircleCheck,
  Code2,
  FileCheck2,
  FolderLock,
  GraduationCap,
  History,
  Languages,
  LayoutTemplate,
  LockKeyhole,
  Megaphone,
  MessagesSquare,
  NotebookTabs,
  School,
  ServerCog,
  Users,
  UserRound,
} from "lucide-react";
import { useState } from "react";

import { LocaleToggle } from "~/components/theme/LocaleToggle";
import { ThemeToggle } from "~/components/theme/ThemeToggle";
import * as m from "~/i18n/messages";

import { DemoForm } from "./DemoForm";

const SOURCE = "https://github.com/salamaashoush/faridalms";
const GUIDE = `${SOURCE}/blob/main/deploy/single-server/README.md`;
const SECURITY = `${SOURCE}/blob/main/SECURITY.md`;

const CONTAINER = "mx-auto w-full max-w-6xl px-6";

function SectionHeading({
  id,
  title,
  body,
}: {
  id?: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="max-w-2xl">
      <h2
        id={id}
        className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl"
      >
        {title}
      </h2>
      {body ? (
        <p className="mt-4 text-lg leading-relaxed text-pretty text-muted-foreground">
          {body}
        </p>
      ) : null}
    </div>
  );
}

function Tile({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon aria-hidden className="size-5" />
      </span>
      <h3 className="mt-5 text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {body}
      </p>
    </div>
  );
}

function Header() {
  const links = [
    { href: "#features", label: m.productNavFeatures() },
    { href: "#languages", label: m.productNavLanguages() },
    { href: "#security", label: m.productNavTrust() },
    { href: "#self-hosting", label: m.productNavSelfHost() },
  ];
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className={cn(CONTAINER, "flex h-16 items-center gap-6")}>
        <a
          href="#top"
          className="flex shrink-0 items-center gap-2 font-semibold whitespace-nowrap text-primary"
        >
          <GraduationCap aria-hidden className="size-6" />
          {m.appName()}
        </a>
        <nav aria-label={m.productNavLabel()} className="hidden md:block">
          <ul className="flex gap-1">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ms-auto flex items-center gap-1">
          <LocaleToggle />
          <ThemeToggle />
          <Link
            to="/sign-in"
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "hidden sm:inline-flex",
            )}
          >
            {m.productSignIn()}
          </Link>
          <a href="#demo" className={cn(buttonVariants(), "ms-1 px-4")}>
            {m.productRequestDemo()}
          </a>
        </div>
      </div>
    </header>
  );
}

/** A still picture of a school's day in the portal, drawn rather than a screenshot. */
function Glimpse() {
  const rows: { icon: LucideIcon; text: string; tone: string }[] = [
    {
      icon: CircleCheck,
      text: m.productMockAttendance(),
      tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    {
      icon: FileCheck2,
      text: m.productMockWork(),
      tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    },
    {
      icon: Megaphone,
      text: m.productMockNews(),
      tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    },
    {
      icon: Languages,
      text: m.productMockRead(),
      tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    },
  ];
  return (
    <div
      aria-hidden
      className="relative rounded-2xl bg-card p-2 text-card-foreground shadow-2xl ring-1 ring-black/5"
    >
      <div className="rounded-xl border bg-background">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <School className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {m.productMockSchool()}
            </p>
            <p className="text-xs text-muted-foreground">
              {m.productMockToday()}
            </p>
          </div>
        </div>
        <ul className="grid gap-1 p-3">
          {rows.map(({ icon: Icon, text, tone }) => (
            <li
              key={text}
              className="flex items-center gap-3 rounded-lg px-3 py-3"
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-md",
                  tone,
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="text-sm">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="school-sidebar relative overflow-hidden"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -end-48 -top-48 size-[560px] rounded-full border-[90px] border-white/[0.04]"
      />
      <div
        className={cn(
          CONTAINER,
          "relative grid items-center gap-14 py-20 lg:grid-cols-[1.1fr_1fr] lg:py-28",
        )}
      >
        <div>
          <p className="text-sm font-medium tracking-wide text-[#c7d9b8]">
            {m.productHeroEyebrow()}
          </p>
          <h1
            id="hero-title"
            className="mt-4 text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            {m.productHeroTitle()}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-[#bcd2c8]">
            {m.productHeroBody()}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a
              href="#demo"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-[#dcedcf] px-6 text-[#193e35] hover:bg-[#cfe5bf]",
              )}
            >
              {m.productRequestDemo()}
            </a>
            <Link
              to="/sign-in"
              className={cn(
                buttonVariants({ size: "lg", variant: "ghost" }),
                "border border-white/20 px-6 text-[#edf4ed] hover:bg-white/10 hover:text-white",
              )}
            >
              {m.productHeroSecondary()}
            </Link>
          </div>
          <p className="mt-6 text-sm text-[#a9c4bb]">{m.productHeroNote()}</p>
        </div>
        <Glimpse />
      </div>
    </section>
  );
}

function Audiences() {
  const roles = [
    {
      icon: School,
      title: m.productForLeaders(),
      body: m.productForLeadersBody(),
    },
    {
      icon: NotebookTabs,
      title: m.productForTeachers(),
      body: m.productForTeachersBody(),
    },
    {
      icon: UserRound,
      title: m.productForStudents(),
      body: m.productForStudentsBody(),
    },
    {
      icon: Users,
      title: m.productForFamilies(),
      body: m.productForFamiliesBody(),
    },
  ];
  return (
    <section aria-labelledby="audiences" className="py-20 sm:py-24">
      <div className={CONTAINER}>
        <SectionHeading id="audiences" title={m.productForTitle()} />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((role) => (
            <Tile key={role.title} {...role} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: BookOpen,
      title: m.productFeatureLearning(),
      body: m.productFeatureLearningBody(),
    },
    {
      icon: Code2,
      title: m.productFeatureCoding(),
      body: m.productFeatureCodingBody(),
    },
    {
      icon: CalendarDays,
      title: m.productFeatureSchoolLife(),
      body: m.productFeatureSchoolLifeBody(),
    },
    {
      icon: FolderLock,
      title: m.productFeatureRecords(),
      body: m.productFeatureRecordsBody(),
    },
    {
      icon: LayoutTemplate,
      title: m.productFeatureWebsite(),
      body: m.productFeatureWebsiteBody(),
    },
    {
      icon: MessagesSquare,
      title: m.productFeatureMessages(),
      body: m.productFeatureMessagesBody(),
    },
  ];
  return (
    <section
      aria-labelledby="features"
      className="scroll-mt-16 border-y bg-muted/40 py-20 sm:py-24"
    >
      <div className={CONTAINER}>
        <SectionHeading
          id="features"
          title={m.productFeaturesTitle()}
          body={m.productFeaturesBody()}
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Tile key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Bilingual() {
  const points = [
    m.productLanguagesPoint1(),
    m.productLanguagesPoint2(),
    m.productLanguagesPoint3(),
  ];
  return (
    <section
      aria-labelledby="languages"
      className="scroll-mt-16 py-20 sm:py-24"
    >
      <div className={cn(CONTAINER, "grid items-center gap-12 lg:grid-cols-2")}>
        <div>
          <SectionHeading
            id="languages"
            title={m.productLanguagesTitle()}
            body={m.productLanguagesBody()}
          />
          <ul className="mt-8 grid gap-3">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check aria-hidden className="size-3" />
                </span>
                <span className="text-base">{point}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-4">
          <article
            lang="en"
            dir="ltr"
            className="rounded-xl border bg-card p-6 shadow-sm"
          >
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {m.languageEnglish()}
            </p>
            <h3 className="mt-2 text-lg font-semibold">
              {m.productSampleEnglish()}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {m.productSampleEnglishBody()}
            </p>
          </article>
          <article
            lang="ar"
            dir="rtl"
            className="rounded-xl border bg-card p-6 shadow-sm lg:ms-10"
          >
            <p className="text-xs font-medium text-muted-foreground">
              {m.languageArabic()}
            </p>
            <h3 className="mt-2 text-lg font-semibold">
              {m.productSampleArabic()}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {m.productSampleArabicBody()}
            </p>
          </article>
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
      aria-labelledby="security"
      className="school-sidebar scroll-mt-16 py-20 sm:py-24"
    >
      <div className={CONTAINER}>
        <h2
          id="security"
          className="max-w-2xl text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {m.productTrustTitle()}
        </h2>
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <span className="grid size-10 place-items-center rounded-lg border border-white/15 bg-white/5">
                <Icon aria-hidden className="size-5" />
              </span>
              <h3 className="mt-5 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#bcd2c8]">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Steps() {
  const steps = [
    { title: m.productStep1(), body: m.productStep1Body() },
    { title: m.productStep2(), body: m.productStep2Body() },
    { title: m.productStep3(), body: m.productStep3Body() },
  ];
  return (
    <section aria-labelledby="steps" className="py-20 sm:py-24">
      <div className={CONTAINER}>
        <SectionHeading id="steps" title={m.productStepsTitle()} />
        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="border-t-2 border-primary pt-6">
              <span className="text-sm font-semibold text-primary tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function SelfHosting() {
  return (
    <section
      aria-labelledby="self-hosting"
      className="scroll-mt-16 pb-20 sm:pb-24"
    >
      <div className={CONTAINER}>
        <div className="flex flex-col gap-8 rounded-2xl border bg-muted/40 p-8 sm:p-10 lg:flex-row lg:items-center">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-background text-primary ring-1 ring-border">
            <Code2 aria-hidden className="size-6" />
          </span>
          <div className="flex-1">
            <h2
              id="self-hosting"
              className="text-2xl font-semibold tracking-tight"
            >
              {m.productOpenTitle()}
            </h2>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground">
              {m.productOpenBody()}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
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
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Demo() {
  return (
    <section
      aria-labelledby="demo"
      className="scroll-mt-16 border-t bg-muted/40 py-20 sm:py-24"
    >
      <div className={cn(CONTAINER, "grid gap-12 lg:grid-cols-[1fr_1.2fr]")}>
        <SectionHeading
          id="demo"
          title={m.productDemoTitle()}
          body={m.productDemoBody()}
        />
        <DemoForm />
      </div>
    </section>
  );
}

function Footer() {
  const [year] = useState(() => new Date().getFullYear());
  return (
    <footer className="border-t">
      <div
        className={cn(
          CONTAINER,
          "flex flex-col gap-6 py-10 text-sm text-muted-foreground md:flex-row md:items-center",
        )}
      >
        <span className="flex items-center gap-2 font-semibold text-foreground">
          <GraduationCap aria-hidden className="size-5 text-primary" />
          {m.appName()}
        </span>
        <nav aria-label={m.productNavLabel()} className="md:ms-auto">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li>
              <Link to="/sign-in" className="hover:text-foreground">
                {m.productSignIn()}
              </Link>
            </li>
            <li>
              <a href={GUIDE} className="hover:text-foreground">
                {m.productFooterSelfHost()}
              </a>
            </li>
            <li>
              <a href={SOURCE} className="hover:text-foreground">
                {m.productFooterSource()}
              </a>
            </li>
            <li>
              <a href={SECURITY} className="hover:text-foreground">
                {m.productFooterSecurity()}
              </a>
            </li>
          </ul>
        </nav>
        <p>
          {m.commonCopyRights({ year })} · {m.productFooterLicence()}
        </p>
      </div>
    </footer>
  );
}

/** The platform's own site on its bare domain: what Farida is, and the way in. */
export function ProductSite() {
  return (
    <div id="top" className="min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        {m.navSkipToContent()}
      </a>
      <Header />
      <main id="main">
        <Hero />
        <Audiences />
        <Features />
        <Bilingual />
        <Trust />
        <Steps />
        <SelfHosting />
        <Demo />
      </main>
      <Footer />
    </div>
  );
}
