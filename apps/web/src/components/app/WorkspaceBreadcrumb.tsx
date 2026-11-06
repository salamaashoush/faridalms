import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@faridalms/ui/breadcrumb";
import {
  BreadcrumbCurrent,
  BreadcrumbStep,
} from "@faridalms/ui/system/app-shell";
import { Link, useRouterState } from "@tanstack/react-router";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

import { NAVIGATION } from "./navigation";

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
