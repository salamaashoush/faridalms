import { StatusText } from "@faridalms/ui/system/status";
import { Link } from "@tanstack/react-router";

import type { Filling } from "~/utils/extension";

import {
  HomeCard,
  HomeItem,
  HomeList,
  itemLink,
} from "~/components/home/parts";
import { familyCards, learnerCards } from "~/components/home/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { myApplicationsQuery } from "~/queries/admissions";
import { getMyApplications } from "~/server/admissions";
import { formatNumber } from "~/utils/datetime";
import { fill } from "~/utils/extension";

import {
  APPLICATION_STATE_LABEL,
  APPLICATION_STATE_TONE,
} from "./application-labels";

type Mine = Awaited<ReturnType<typeof getMyApplications>>;

// The applications page's own read under its own key, so the two share it.
const mine = {
  queryKey: myApplicationsQuery.queryKey,
  queryFn: () => getMyApplications(),
};

const card = (to: "/family/applications" | "/me/applications") => ({
  key: "applications",
  place: 20,
  area: "main" as const,
  query: (capabilities: readonly string[]) =>
    capabilities.includes("applications:submit") ? mine : null,
  cardOf: (read: unknown) => {
    const { applications } = read as Mine;
    if (!applications.length) return null;
    return (
      <HomeCard
        key="applications"
        title={m.homeApplications()}
        action={{ label: m.homeOpenApplications(), link: { to } }}
      >
        <HomeList>
          {applications.map((row) => (
            <HomeItem
              key={row.id}
              title={
                <Link to={to} className={itemLink}>
                  <bdi>
                    {inLocale(row.applicant.nameEn, row.applicant.nameAr)}
                  </bdi>
                </Link>
              }
              facts={[
                row.intake
                  ? inLocale(row.intake.titleEn, row.intake.titleAr)
                  : null,
                row.needed
                  ? m.famAppsNeeded({ count: formatNumber(row.needed) })
                  : null,
              ]}
              status={
                <StatusText tone={APPLICATION_STATE_TONE[row.state]}>
                  {APPLICATION_STATE_LABEL[row.state]()}
                </StatusText>
              }
            />
          ))}
        </HomeList>
      </HomeCard>
    );
  },
});

/**
 * Admissions on a home: where each of the viewer's applications stands,
 * which is all an applicant with nobody enrolled yet has to come back to.
 */
export const ADMISSIONS_HOME: Filling[] = [
  fill(familyCards, card("/family/applications")),
  fill(learnerCards, card("/me/applications")),
];
