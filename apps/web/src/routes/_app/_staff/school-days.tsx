import { addDays, shiftMonth } from "@faridalms/domain/school";
import { Button } from "@faridalms/ui/button";
import {
  BreadcrumbCurrent,
  BreadcrumbStep,
} from "@faridalms/ui/system/app-shell";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as v from "valibot";

import { DayPlanner } from "~/components/school-days/DayPlanner";
import { dayPlannerParts } from "~/components/school-days/slots";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { schoolDaysQuery } from "~/queries/school-days";
import { currentUserQuery } from "~/queries/user";
import { formatMonthLabel } from "~/utils/datetime";
import { filled } from "~/utils/extension";
import { requirePage } from "~/utils/page-access";

/** How many months the page shows at once. */
const MONTHS = 12;

const searchSchema = v.object({
  start: v.fallback(
    v.optional(v.pipe(v.string(), v.regex(/^\d{4}-(0[1-9]|1[0-2])$/))),
    undefined,
  ),
});

/** The days shown from a first month: that month and the eleven after it. */
function spanOf(start: string) {
  return {
    from: `${start}-01`,
    to: addDays(`${shiftMonth(start, MONTHS)}-01`, -1),
  };
}

function SchoolDaysTrail() {
  return (
    <>
      <BreadcrumbStep render={<Link to="/settings" />}>
        {m.adminSettingsTitle()}
      </BreadcrumbStep>
      <BreadcrumbCurrent>{m.schoolDaysTitle()}</BreadcrumbCurrent>
    </>
  );
}

export const Route = createFileRoute("/_app/_staff/school-days")({
  staticData: {
    trail: <SchoolDaysTrail />,
    section: "/settings",
  },
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "calendar:manage", "school:manage");
    const span = spanOf(deps.start ?? user.today.slice(0, 7));
    await Promise.all([
      context.queryClient.ensureQueryData(schoolDaysQuery(span.from, span.to)),
      ...filled(context.extensions, user, dayPlannerParts).map((part) =>
        context.queryClient.ensureQueryData(part.query(span.from, span.to)),
      ),
    ]);
  },
  component: SchoolDaysPage,
});

function SchoolDaysPage() {
  const user = useCurrentUser();
  const navigate = Route.useNavigate();
  const start = Route.useSearch().start ?? user.today.slice(0, 7);
  const span = spanOf(start);
  const move = (months: number) =>
    void navigate({
      resetScroll: false,
      search: { start: shiftMonth(start, months) },
    });
  return (
    <Page width="record">
      <PageHeader
        title={m.schoolDaysTitle()}
        description={m.schoolDaysHint()}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="max-md:size-10"
          aria-label={m.schoolDaysEarlier()}
          onClick={() => move(-MONTHS)}
        >
          <ChevronLeft className="rtl:rotate-180" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="max-md:size-10"
          aria-label={m.schoolDaysLater()}
          onClick={() => move(MONTHS)}
        >
          <ChevronRight className="rtl:rotate-180" aria-hidden />
        </Button>
        <p aria-live="polite" className="text-sm leading-5 font-medium">
          {m.accessDuring({
            from: formatMonthLabel(start),
            to: formatMonthLabel(span.to.slice(0, 7)),
          })}
        </p>
      </div>
      <DayPlanner from={span.from} to={span.to} />
    </Page>
  );
}
