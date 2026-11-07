import type { AuthBandContent } from "@faridalms/ui/system/auth-layout";
import type { CSSProperties, ReactNode } from "react";

import { portalAccent } from "@faridalms/domain/portal-face";
import { contrast } from "@faridalms/domain/site-theme";
import { cn } from "@faridalms/ui/cn";
import { AuthLayout } from "@faridalms/ui/system/auth-layout";
import { ThemeToggle } from "@faridalms/ui/system/theme-toggle";
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

/** What the band beside a portal's form says, in the school's name where it has one. */
function bandOf(face: PortalFace | null): AuthBandContent {
  const website = face?.websiteHost ? hostHref(face.websiteHost, "/") : null;
  return {
    eyebrow: face ? m.portalEyebrow() : m.workspaceLabel(),
    heading: m.authBrandHeading(),
    body: m.authBrandBody(),
    features: [
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
    ],
    link: website ? (
      <a
        href={website}
        className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
      >
        {m.portalWebsite()}
        <ArrowUpRight aria-hidden className="size-4 rtl:-scale-x-100" />
      </a>
    ) : null,
  };
}

export interface PortalLayoutProps {
  face: PortalFace | null;
  wide?: boolean;
  children: ReactNode;
}

/**
 * Every portal page before sign-in, in the school's name and colour on a
 * school's portal and the platform's where no school is named yet. A paused
 * school's portal says so instead of offering its form.
 */
export function PortalLayout({
  face,
  wide = false,
  children,
}: PortalLayoutProps) {
  return (
    <AuthLayout
      {...faceAccent(face)}
      mark={face ? <SchoolMark face={face} /> : <PlatformMark />}
      band={bandOf(face)}
      wide={wide}
      tools={
        <>
          <LocaleToggle />
          <ThemeToggle />
        </>
      }
      footer={<PlatformFooter />}
    >
      {face?.paused ? (
        <p className="text-sm leading-6 text-muted-foreground">
          {m.portalPaused()}
        </p>
      ) : (
        children
      )}
    </AuthLayout>
  );
}
