import type { SiteLocale } from "@faridalms/domain/website";

import { buttonVariants } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";

import type { PortalFace } from "~/queries/portal";

import { PortalPage } from "~/components/auth/SchoolFace";
import * as m from "~/i18n/messages";
import { portalHref } from "~/utils/host";

/**
 * A school's website before it opens: the school's own portal page, in its
 * name and look, sending visitors to the portal rather than the platform's
 * bare 404.
 */
export function SiteNotOpen({
  face,
  locale,
}: {
  face: PortalFace;
  locale: SiteLocale;
}) {
  const t = { locale };
  const school =
    (locale === "ar" ? face.name.ar : face.name.en) ||
    face.name.en ||
    face.name.ar ||
    "";
  return (
    <PortalPage face={face} ownWords onSite>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <h1 className="text-[32px] leading-10 font-semibold text-foreground">
            {m.siteNotOpenTitle({}, t)}
          </h1>
          <p className="text-muted-foreground">
            {m.siteNotOpenBody({ school }, t)}
          </p>
        </div>
        <a
          href={portalHref(face.school, "/sign-in")}
          className={cn(buttonVariants(), "justify-self-start max-md:h-10")}
        >
          {m.siteNotOpenPortal({}, t)}
        </a>
      </div>
    </PortalPage>
  );
}
