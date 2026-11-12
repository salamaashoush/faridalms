import { FAMILY_ROLES } from "@faridalms/domain/workspace";
import { cn } from "@faridalms/ui/cn";
import { initialsOf } from "@faridalms/ui/system/app-shell";
import {
  phoneLink,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { displayName, labelOf } from "~/components/people/format";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { childrenQuery } from "~/queries/families";

export interface PersonChildrenProps {
  personId: string;
  roles: readonly string[];
}

/** The students a person is linked to, on their record, shown while they have any or hold a family role. */
export function PersonChildren({ personId, roles }: PersonChildrenProps) {
  const children = useSuspenseQuery(childrenQuery(personId)).data;
  const { capabilities, workspace } = useCurrentUser();
  if (
    children.length === 0 &&
    !roles.some((role) => (FAMILY_ROLES as readonly string[]).includes(role))
  )
    return null;
  const opensRecords =
    capabilities.includes("people:read") ||
    capabilities.includes("people:manage");
  const linkClass = cn(
    "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
    phoneLink,
  );
  return (
    <RecordSection title={m.personChildren()}>
      {children.length === 0 ? (
        <RecordEmpty>{m.personNoChildren()}</RecordEmpty>
      ) : (
        <RecordList>
          {children.map((child) => (
            <li
              key={child.relationshipId}
              className="flex items-start gap-3 py-3"
            >
              <span
                aria-hidden
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
              >
                {initialsOf(displayName(child))}
              </span>
              <div className="grid min-w-0 flex-1 gap-0.5">
                {opensRecords ? (
                  <Link
                    to="/students/$studentId"
                    params={{ studentId: child.studentId }}
                    search={{}}
                    dir="auto"
                    className={linkClass}
                  >
                    {displayName(child)}
                  </Link>
                ) : workspace === "family" ? (
                  <Link
                    to="/family/details"
                    search={{ studentId: child.studentId }}
                    dir="auto"
                    className={linkClass}
                  >
                    {displayName(child)}
                  </Link>
                ) : (
                  <span dir="auto" className="text-sm leading-5 font-medium">
                    {displayName(child)}
                  </span>
                )}
                {child.relation ? (
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {labelOf(child.relation)}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}
