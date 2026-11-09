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

import { NAVIGATION, pathsOf } from "./navigation";

/** The deepest of these paths the page sits at or beneath. */
function deepest<T extends { to: string }>(
  candidates: readonly T[],
  pathname: string,
  declared: readonly string[],
): T | undefined {
  return (
    candidates.find((candidate) => declared.includes(candidate.to)) ??
    candidates
      .filter(
        (candidate) =>
          pathname === candidate.to || pathname.startsWith(`${candidate.to}/`),
      )
      .toSorted((a, b) => b.to.length - a.to.length)[0]
  );
}

/**
 * Where you are: the area from the navigation, then the tab of the area
 * when the area has several pages, then the page when it is something
 * inside, with the record between them when the page names one.
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
    items.find((item) =>
      pathsOf(item).some((path) => declaredPaths.includes(path)),
    ) ??
    items
      .flatMap((item) => pathsOf(item).map((to) => ({ to, item })))
      .filter(({ to }) => pathname === to || pathname.startsWith(`${to}/`))
      .toSorted((a, b) => b.to.length - a.to.length)[0]?.item;
  const tab = section?.pages
    ? deepest(section.pages, pathname, declaredPaths)
    : undefined;
  const sectionLabel = section?.label();
  const tabLabel = tab?.label();
  const areaStep =
    section && sectionLabel ? (
      <BreadcrumbStep render={<Link to={section.to} />}>
        {sectionLabel}
      </BreadcrumbStep>
    ) : null;
  return (
    <Breadcrumb aria-label={m.navBreadcrumb()} className="min-w-0">
      <BreadcrumbList className="flex-nowrap text-sm">
        {trail ? (
          <>
            {areaStep}
            {tab && tabLabel ? (
              <BreadcrumbStep render={<Link to={tab.to} />}>
                {tabLabel}
              </BreadcrumbStep>
            ) : null}
            {trail}
          </>
        ) : tab && tabLabel ? (
          <>
            {areaStep}
            {page && page !== tabLabel ? (
              <>
                <BreadcrumbStep render={<Link to={tab.to} />}>
                  {tabLabel}
                </BreadcrumbStep>
                <BreadcrumbCurrent>{page}</BreadcrumbCurrent>
              </>
            ) : (
              <BreadcrumbCurrent>{tabLabel}</BreadcrumbCurrent>
            )}
          </>
        ) : sectionLabel && page && page !== sectionLabel && section ? (
          <>
            {areaStep}
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
