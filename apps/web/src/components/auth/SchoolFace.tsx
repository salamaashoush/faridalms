import type { CSSProperties, ReactNode } from "react";

import { portalAccent } from "@faridalms/domain/portal-face";
import { contrast } from "@faridalms/domain/site-theme";
import { cn } from "@faridalms/ui/cn";
import {
  ArrowUpRight,
  BookOpen,
  GraduationCap,
  Languages,
  Mail,
  Phone,
  Users,
} from "lucide-react";

import type { PortalFace } from "~/queries/portal";

import { LICENCE, SECURITY } from "~/components/product/links";
import { publicMediaUrl } from "~/components/site/render/parts";
import { LocaleToggle } from "~/components/theme/LocaleToggle";
import { ThemeToggle } from "~/components/theme/ThemeToggle";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { hostHref } from "~/utils/host";

export const faceName = (face: PortalFace) =>
  inLocale(face.name.en, face.name.ar);

/**
 * The school's colour in the app's own design system: its main colour as
 * the band beside the form, and, in the shade that reads on the app's light
 * and dark pages, as the accent of buttons and links. A school that never
 * styled its website keeps the platform's colours.
 */
export function faceAccent(face: PortalFace | null) {
  if (!face?.palette) return { className: "portal-face" };
  const { light, dark } = portalAccent(face.palette);
  const band = face.palette.primary;
  return {
    className: "portal-face",
    "data-branded": "",
    style: {
      "--face-primary": light.primary,
      "--face-primary-foreground": light.primaryForeground,
      "--face-primary-dark": dark.primary,
      "--face-primary-dark-foreground": dark.primaryForeground,
      "--brand": band,
      "--brand-foreground":
        contrast("#FFFFFF", band) >= 4.5 ? "#FFFFFF" : "#111111",
    } as CSSProperties,
  };
}

export interface SchoolMarkProps {
  face: PortalFace;
  className?: string;
}

/** The school's logo and name. */
export function SchoolMark({ face, className }: SchoolMarkProps) {
  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      {face.logoKey ? (
        <img
          src={publicMediaUrl(face.logoKey)}
          alt=""
          className="size-10 shrink-0 rounded-md bg-white/90 object-contain p-0.5"
        />
      ) : (
        <GraduationCap aria-hidden className="size-7 shrink-0" />
      )}
      <span dir="auto" className="min-w-0 truncate font-semibold">
        {faceName(face)}
      </span>
    </span>
  );
}

function PlatformMark() {
  return (
    <span className="flex items-center gap-2 font-semibold">
      <GraduationCap aria-hidden className="size-7" />
      {m.appName()}
    </span>
  );
}

export interface PlatformFooterProps {
  className?: string;
}

/** The platform's name and its legal documents, small, under every sign-in page. */
export function PlatformFooter({ className }: PlatformFooterProps) {
  return (
    <footer
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-4 gap-y-2 p-6 text-xs text-muted-foreground",
        className,
      )}
    >
      <span>{m.portalPoweredBy({ platform: m.appName() })}</span>
      <nav aria-label={m.portalLegal()}>
        <ul className="flex flex-wrap gap-x-4 gap-y-2">
          <li>
            <a
              href={LICENCE}
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              {m.portalLicence()}
            </a>
          </li>
          <li>
            <a
              href={SECURITY}
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              {m.productFooterSecurity()}
            </a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}

interface ContactLinksProps {
  face: PortalFace;
  className?: string;
}

/** The school office's own ways to be reached. */
function ContactLinks({ face, className }: ContactLinksProps) {
  const { email, phone } = face.contact;
  if (!email && !phone) return null;
  return (
    <ul className={cn("grid gap-1.5", className)}>
      {email ? (
        <li>
          <a
            dir="ltr"
            href={`mailto:${email}`}
            className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
          >
            <Mail aria-hidden className="size-4 opacity-70" />
            {email}
          </a>
        </li>
      ) : null}
      {phone ? (
        <li>
          <a
            dir="ltr"
            href={`tel:${phone.replace(/\s+/g, "")}`}
            className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
          >
            <Phone aria-hidden className="size-4 opacity-70" />
            {phone}
          </a>
        </li>
      ) : null}
    </ul>
  );
}

export interface PortalHelpProps {
  face: PortalFace | null;
  topic: "sign-in" | "apply";
}

/** Where to turn when the form does not let someone in: the school office. */
export function PortalHelp({ face, topic }: PortalHelpProps) {
  if (!face) return null;
  return (
    <section className="mt-10 grid gap-2 border-t pt-6 text-sm">
      <h2 className="font-semibold text-foreground">
        {topic === "apply" ? m.portalApplyHelpTitle() : m.portalHelpTitle()}
      </h2>
      <p className="leading-relaxed text-muted-foreground">
        {topic === "apply" ? m.portalApplyHelpBody() : m.portalHelpBody()}
      </p>
      <ContactLinks face={face} className="mt-1 text-primary" />
    </section>
  );
}

export interface PortalHeadingProps {
  title: string;
  lead?: string;
}

/** A heading and a sentence over a portal page's form. */
export function PortalHeading({ title, lead }: PortalHeadingProps) {
  return (
    <div className="mb-8 grid gap-2">
      <h1
        dir="auto"
        className="text-[32px] leading-10 font-semibold tracking-tight text-foreground"
      >
        {title}
      </h1>
      {lead ? <p className="text-muted-foreground">{lead}</p> : null}
    </div>
  );
}

interface BandProps {
  face: PortalFace | null;
}

function Band({ face }: BandProps) {
  const features = [
    {
      icon: BookOpen,
      title: m.authFeatureLearning(),
      body: m.authFeatureLearningBody(),
    },
    {
      icon: Users,
      title: m.authFeatureCommunity(),
      body: m.authFeatureCommunityBody(),
    },
    {
      icon: Languages,
      title: m.authFeatureLanguage(),
      body: m.authFeatureLanguageBody(),
    },
  ];
  const website = face?.websiteHost ? hostHref(face.websiteHost, "/") : null;
  return (
    <aside className="school-sidebar relative hidden overflow-hidden p-12 lg:flex lg:flex-col xl:p-16">
      <div className="text-lg">
        {face ? <SchoolMark face={face} /> : <PlatformMark />}
      </div>
      <div className="relative z-10 my-auto max-w-lg py-16">
        <p className="mb-5 text-xs font-medium tracking-[0.2em] uppercase opacity-75 rtl:tracking-normal">
          {face ? m.portalEyebrow() : m.workspaceLabel()}
        </p>
        <p className="text-5xl leading-[1.15] font-medium tracking-tight xl:text-6xl">
          {m.authBrandHeading()}
        </p>
        <p className="mt-6 max-w-md text-base leading-relaxed opacity-80">
          {m.authBrandBody()}
        </p>
        <ul className="mt-12 space-y-7">
          {features.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-current/15 bg-current/5">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-1 text-sm opacity-75">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {website ? (
        <a
          href={website}
          className="relative z-10 inline-flex items-center gap-1.5 self-start text-sm font-medium underline-offset-4 hover:underline"
        >
          {m.portalWebsite()}
          <ArrowUpRight aria-hidden className="size-4 rtl:-scale-x-100" />
        </a>
      ) : null}
      <div
        className="pointer-events-none absolute -end-40 -bottom-56 size-[520px] rounded-full border-[80px] border-current/[0.05]"
        aria-hidden
      />
    </aside>
  );
}

export interface PortalLayoutProps {
  face: PortalFace | null;
  wide?: boolean;
  children: ReactNode;
}

/**
 * Every page before sign-in, the app's own in its own design system: a band
 * in the school's colour with its name and logo beside the form, or the
 * platform's where no school is named yet. A long flow, such as an
 * application, takes the whole width under a slim header instead.
 */
export function PortalLayout({
  face,
  wide = false,
  children,
}: PortalLayoutProps) {
  const accent = faceAccent(face);
  const mark = face ? <SchoolMark face={face} /> : <PlatformMark />;
  return (
    <div
      {...accent}
      className={cn(
        accent.className,
        "grid min-h-dvh",
        !wide && "lg:grid-cols-[1fr_1.05fr]",
      )}
    >
      {wide ? null : <Band face={face} />}
      <div className="flex min-h-dvh flex-col">
        <div
          className={cn(
            "flex items-center justify-between gap-4 p-5 sm:p-8",
            wide && "border-b",
          )}
        >
          <span className={cn("min-w-0 text-primary", !wide && "lg:invisible")}>
            {mark}
          </span>
          <div className="flex shrink-0 gap-1">
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </div>
        <main
          id="main"
          className={cn(
            "flex flex-1 justify-center px-6 py-12 sm:px-12",
            wide ? "items-start" : "items-center",
          )}
        >
          <div className={cn("w-full", wide ? "max-w-3xl" : "max-w-[400px]")}>
            {face?.paused ? (
              <p className="text-sm leading-6 text-muted-foreground">
                {m.portalPaused()}
              </p>
            ) : (
              children
            )}
          </div>
        </main>
        <PlatformFooter />
      </div>
    </div>
  );
}
