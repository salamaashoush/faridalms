import type { PortalDoor } from "@faridalms/domain/site-sections";
import type { Theme } from "@faridalms/domain/site-theme";
import type { CSSProperties, ReactNode } from "react";

import { portalAccent } from "@faridalms/domain/portal-face";
import { PORTAL_DOORS } from "@faridalms/domain/site-sections";
import { PLATFORM_PALETTE, THEMES } from "@faridalms/domain/site-theme";
import { newSection } from "@faridalms/domain/website";
import { cn } from "@faridalms/ui/cn";

import type { SiteFrameModel } from "~/components/site/render/frame";
import type { RenderContext } from "~/components/site/render/parts";
import type { PortalFace } from "~/queries/portal";

import { LICENCE, SECURITY } from "~/components/product/links";
import { SiteFrame } from "~/components/site/render/frame";
import { opensOnPicture, PageSections } from "~/components/site/render/page";
import { publicMediaUrl } from "~/components/site/render/parts";
import { panelDoor } from "~/components/site/render/sections";
import { LocaleToggle } from "~/components/theme/LocaleToggle";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { hostHref } from "~/utils/host";

/**
 * The look of a school that never styled its website: the platform's own
 * green and faces, so its sign-in page still carries its name.
 */
const PLATFORM_THEME: Theme = {
  ...THEMES.meridian,
  palette: PLATFORM_PALETTE,
  fonts: {
    headingLatin: "inter",
    bodyLatin: "inter",
    headingArabic: "notoSansArabic",
    bodyArabic: "notoSansArabic",
  },
  headingScale: "classic",
  headingCase: "none",
};

export const faceName = (face: PortalFace) =>
  inLocale(face.name.en, face.name.ar);

/**
 * The school's colour as the form's accent, in the shade that reads on the
 * app's light and dark pages. A school that never styled its website keeps
 * the platform's accent.
 */
export function faceAccent(face: PortalFace | null) {
  if (!face?.theme) return { className: "portal-face" };
  const { light, dark } = portalAccent(face.theme.palette);
  return {
    className: "portal-face",
    "data-branded": "",
    style: {
      "--face-primary": light.primary,
      "--face-primary-foreground": light.primaryForeground,
      "--face-primary-dark": dark.primary,
      "--face-primary-dark-foreground": dark.primaryForeground,
    } as CSSProperties,
  };
}

/** The school's logo and name, as its website heads its pages. */
export function SchoolMark({
  face,
  className,
}: {
  face: PortalFace;
  className?: string;
}) {
  const name = faceName(face);
  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      {face.logoKey ? (
        <img
          src={publicMediaUrl(face.logoKey)}
          alt=""
          className="size-10 shrink-0 rounded-md object-contain"
        />
      ) : null}
      <span dir="auto" className="min-w-0 truncate font-semibold">
        {name}
      </span>
    </span>
  );
}

/** The website's frame around the portal page, its links leading to the website's own host. */
function frameOf(face: PortalFace): SiteFrameModel {
  const site = face.frame;
  const out = (href: string) =>
    site && href.startsWith("/") && !href.startsWith("//")
      ? hostHref(site.siteHost, href)
      : href;
  const links = <T extends { href: string }>(rows: T[]) =>
    rows.map((row) => ({ ...row, href: out(row.href) }));
  return {
    name: faceName(face),
    tagline: site?.tagline ?? "",
    logoUrl: face.logoKey ? publicMediaUrl(face.logoKey) : null,
    banner: null,
    utility: links(site?.utility ?? []),
    actions: links(site?.actions ?? []),
    menu: links(site?.menu ?? []),
    footerColumns: (site?.footerColumns ?? []).map((column) => ({
      ...column,
      links: links(column.links),
    })),
    footerNote: site?.footerNote ?? "",
    dock: false,
    socialLinks: site?.socialLinks ?? [],
    otherLanguage: null,
    currentHref: "",
    signInHref: "/sign-in",
    homeHref: site ? hostHref(site.siteHost, "/") : "/sign-in",
  };
}

/**
 * A page of a school's portal: the portal page of its site, drawn by the
 * website's renderer in its theme and frame, its system section holding
 * what the portal shows now (the sign-in form, or the page of a reset, a
 * welcome or a badge). Nothing a school writes runs as script: sections are
 * data the renderer draws.
 */
export function PortalPage({
  face,
  ownWords,
  door = "sign-in",
  wide = false,
  children,
}: {
  face: PortalFace;
  /** The flow being shown says its own heading, in place of the section's. */
  ownWords: boolean;
  /** Which door's page this is, whose system section holds the flow. */
  door?: PortalDoor;
  wide?: boolean;
  children: ReactNode;
}) {
  const locale = getLocale() === "ar" ? "ar" : "en";
  const theme = face.theme ?? PLATFORM_THEME;
  const accent = faceAccent(face);
  // A published page always holds its door's form; one that somehow lost it
  // still lets people through.
  const system = PORTAL_DOORS[door];
  const sections = face.page.sections.some(
    (item) => item.section.type === system,
  )
    ? face.page.sections
    : [
        ...face.page.sections,
        { section: newSection(system), locale: face.page.locale },
      ];
  const context: RenderContext = {
    school: face.school,
    locale,
    theme,
    fileUrl: (fileId) => {
      const key = face.page.media[fileId];
      return key ? publicMediaUrl(key) : null;
    },
    news: [],
    events: [],
    contact: face.contact,
    turnstileKey: face.turnstileKey,
    system: {
      node: children,
      ownWords,
      wide,
      mark: <SchoolMark face={face} />,
    },
  };
  const bare = sections.some(({ section }) => panelDoor(section));
  return (
    <div {...accent} className={cn(accent.className, "min-h-dvh")}>
      <SiteFrame
        frame={frameOf(face)}
        context={context}
        overlay={opensOnPicture(sections)}
        bare={bare}
      >
        <PageSections
          sections={sections}
          title={ownWords ? "" : face.page.title}
          context={context}
        />
      </SiteFrame>
      <div className="flex flex-wrap items-center justify-center gap-2 border-t bg-background">
        <PlatformFooter />
        <LocaleToggle />
      </div>
    </div>
  );
}

/** The platform's name and its legal documents, small, under every sign-in page. */
export function PlatformFooter({ className }: { className?: string }) {
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
