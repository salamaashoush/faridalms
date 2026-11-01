import type { ContentDocument } from "@faridalms/domain/content";
import type { Theme } from "@faridalms/domain/site-theme";
import type { CSSProperties } from "react";

import { portalAccent } from "@faridalms/domain/portal-face";
import { THEMES } from "@faridalms/domain/site-theme";
import { cn } from "@faridalms/ui/cn";

import type { PortalFace } from "~/queries/portal";

import { ContentView } from "~/components/content/ContentView";
import { LICENCE, SECURITY } from "~/components/product/links";
import { publicMediaUrl } from "~/components/site/render/parts";
import {
  schemeStyle,
  themeAttributes,
  themeStyle,
} from "~/components/site/render/theme";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

/**
 * The look of a school that never styled its website: the platform's own
 * green and faces, so its sign-in page still carries its name and welcome.
 */
const PLATFORM_THEME: Theme = {
  ...THEMES.meridian,
  palette: {
    canvas: "#FFFFFF",
    surface: "#EEF3EE",
    primary: "#153F3A",
    accent: "#C7D9B8",
    ink: "#18221F",
  },
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
 * The school's colour as the page's accent, in the shade that reads on the
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

/** What the school writes beside the form, or the product's welcome when it has written nothing. */
export type FacePage = {
  body: ContentDocument;
  locale: "en" | "ar";
  media: Record<string, string>;
  /** Pictures in a draft being previewed, which have no public address yet. */
  fileUrl?: (fileId: string) => string;
} | null;

/**
 * The school's side of its sign-in pages, drawn in its website's theme: its
 * brand colour scheme and faces, its logo and name, and the page it wrote.
 * The page is an editor document, drawn as the website draws its posts, so
 * nothing a school writes runs as script.
 */
export function SchoolPanel({
  face,
  page = face.page,
  className,
}: {
  face: PortalFace;
  page?: FacePage;
  className?: string;
}) {
  const theme = face.theme ?? PLATFORM_THEME;
  const locale = getLocale() === "ar" ? "ar" : "en";
  const name = faceName(face);
  const written = page?.locale ?? locale;
  return (
    <aside
      aria-label={m.portalAboutSchool({ school: name })}
      className={cn("site-root", className)}
      style={themeStyle(theme, written)}
      {...themeAttributes(theme, true)}
    >
      <div
        className="site-section flex h-full flex-col gap-10 px-6 py-10 sm:px-10 lg:p-12 xl:p-16"
        style={schemeStyle(theme, "brand")}
      >
        <SchoolMark face={face} className="text-lg max-lg:hidden" />
        <div
          lang={written === locale ? undefined : written}
          dir={
            written === locale ? undefined : written === "ar" ? "rtl" : "ltr"
          }
          className="site-prose grid max-w-xl gap-4 lg:my-auto"
        >
          {page ? (
            <ContentView
              document={page.body}
              lang={page.locale}
              fileUrl={(fileId) => {
                if (page.fileUrl) return page.fileUrl(fileId);
                const key = page.media[fileId];
                return key ? publicMediaUrl(key) : "";
              }}
            />
          ) : (
            <>
              <h2 className="site-heading text-3xl leading-tight font-semibold text-balance xl:text-4xl">
                {m.portalWelcomeTitle({ school: name })}
              </h2>
              <p className="text-base">{m.portalWelcomeBody()}</p>
              <p className="site-muted text-sm">{m.portalWelcomeHelp()}</p>
            </>
          )}
        </div>
      </div>
    </aside>
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
