import type { ReactElement, ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@faridalms/ui/breadcrumb";
import { Link, useRouterState } from "@tanstack/react-router";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

import { NAVIGATION } from "./navigation";

/** A step on the way to the page. Phones show the page alone. */
export function BreadcrumbStep({
  render,
  children,
}: {
  render: ReactElement;
  children: ReactNode;
}) {
  return (
    <>
      <BreadcrumbItem className="hidden min-w-0 sm:inline-flex">
        <BreadcrumbLink render={render} dir="auto" className="truncate">
          {children}
        </BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbSeparator className="hidden sm:inline-flex rtl:rotate-180" />
    </>
  );
}

export function BreadcrumbCurrent({ children }: { children: ReactNode }) {
  return (
    <BreadcrumbItem className="min-w-0">
      <BreadcrumbPage dir="auto" className="truncate font-medium">
        {children}
      </BreadcrumbPage>
    </BreadcrumbItem>
  );
}

/**
 * Where you are: the area from the navigation, then the page when it is
 * something inside that area, with the record between them when the page
 * names one.
 */
export function WorkspaceBreadcrumb() {
  const user = useCurrentUser();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const page = useRouterState({
    select: (state) => state.matches.at(-1)?.staticData.breadcrumb?.() ?? null,
  });
  const trail = useRouterState({
    select: (state) => state.matches.at(-1)?.staticData.trail ?? null,
    structuralSharing: false,
  });
  const declared = useRouterState({
    select: (state) => state.matches.at(-1)?.staticData.section ?? null,
  });
  const items = NAVIGATION[user.workspace].flatMap((section) => section.items);
  const declaredPaths = declared === null ? [] : [declared].flat();
  const section =
    items.find((item) => declaredPaths.includes(item.to)) ??
    items
      .filter(
        (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
      )
      .toSorted((a, b) => b.to.length - a.to.length)[0];
  const sectionLabel = section?.label();
  return (
    <Breadcrumb aria-label={m.navBreadcrumb()} className="min-w-0">
      <BreadcrumbList className="flex-nowrap text-sm">
        {trail ? (
          <>
            {section && sectionLabel ? (
              <BreadcrumbStep render={<Link to={section.to} />}>
                {sectionLabel}
              </BreadcrumbStep>
            ) : null}
            {trail}
          </>
        ) : sectionLabel && page && page !== sectionLabel && section ? (
          <>
            <BreadcrumbStep render={<Link to={section.to} />}>
              {sectionLabel}
            </BreadcrumbStep>
            <BreadcrumbCurrent>{page}</BreadcrumbCurrent>
          </>
        ) : (
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate font-medium">
              {page ?? sectionLabel ?? m.navHome()}
            </BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
