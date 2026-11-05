import type { ReactNode } from "react";

import type { PortalFace } from "~/queries/portal";

import { PortalLayout } from "./SchoolFace";

/**
 * The frame of every page before sign-in: the portal's own page, in the
 * school's name and colour on a school's portal and the platform's where no
 * school is known.
 */
export function AuthLayout({
  face = null,
  wide = false,
  children,
}: {
  face?: PortalFace | null;
  /** A long flow, such as an application, takes the page's whole width. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <PortalLayout face={face} wide={wide}>
      {children}
    </PortalLayout>
  );
}
