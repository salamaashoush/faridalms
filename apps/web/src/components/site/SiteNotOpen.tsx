import type { SiteLocale } from "@faridalms/domain/website";

import { buttonVariants } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";

import type { PortalFace } from "~/queries/portal";

import { PortalHeading, PortalLayout } from "~/components/auth/SchoolFace";
import * as m from "~/i18n/messages";
import { portalHref } from "~/utils/host";

export interface SiteNotOpenProps {
  face: PortalFace;
  locale: SiteLocale;
}

/**
 * A school's website before it opens: the portal's own page in the school's
 * name and colour, sending visitors to the portal rather than the
 * platform's bare 404.
 */
export function SiteNotOpen({ face, locale }: SiteNotOpenProps) {
  const t = { locale };
  const school =
    (locale === "ar" ? face.name.ar : face.name.en) ||
    face.name.en ||
    face.name.ar ||
    "";
  return (
    <PortalLayout face={face}>
      <PortalHeading
        title={m.siteNotOpenTitle({}, t)}
        lead={m.siteNotOpenBody({ school }, t)}
      />
      <a
        href={portalHref(face.school, "/sign-in")}
        className={cn(buttonVariants(), "max-md:h-10")}
      >
        {m.siteNotOpenPortal({}, t)}
      </a>
    </PortalLayout>
  );
}
