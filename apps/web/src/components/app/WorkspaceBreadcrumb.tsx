import { ROLE_HOME } from "@faridalms/domain/identity";
import { Link, useRouterState } from "@tanstack/react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "~/components/ui/breadcrumb";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

import { NAVIGATION } from "./navigation";

export function WorkspaceBreadcrumb() {
  const user = useCurrentUser();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const title = useRouterState({
    select: (state) => state.matches.at(-1)?.staticData.breadcrumb?.() ?? null,
  });
  const page = NAVIGATION[user.role]
    .flatMap((section) => section.items)
    .find((item) => item.to === pathname);
  return (
    <Breadcrumb className="hidden xl:block" aria-label={m.navBreadcrumb()}>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link to={ROLE_HOME[user.role]} />}>
            {user.school.name}
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>
            {title ?? page?.label() ?? m.navOverview()}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
