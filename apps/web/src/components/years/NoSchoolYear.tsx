import { ButtonLink } from "@faridalms/ui/system/button-link";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { CalendarPlus } from "lucide-react";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

export interface NoSchoolYearProps {
  /** What the page shows once there is a year, in a sentence. */
  shows?: string;
}

/**
 * What a page that lives inside the school year says before the school has
 * one: a new school starts with none. Whoever can set the year up is taken
 * to do it; anyone else is told who does, so nobody meets a blank page.
 */
export function NoSchoolYear({ shows }: NoSchoolYearProps) {
  const user = useCurrentUser();
  const sets = user.capabilities.includes("years:manage");
  const who = sets
    ? m.noYearYouSetUp()
    : user.workspace === "staff"
      ? m.noYearAdministratorSetsUp()
      : m.noYearSchoolSetsUp();
  return (
    <EmptyState
      icon={CalendarPlus}
      kind={sets ? "empty" : "restricted"}
      title={sets ? m.noYearSetUpTitle() : m.noYearTitle()}
      description={shows ? `${shows} ${who}` : who}
      action={
        sets ? (
          <ButtonLink to="/academic-year-editor" search={{}}>
            {m.noYearSetUpAction()}
          </ButtonLink>
        ) : null
      }
    />
  );
}
