import type { LearnerTab } from "@faridalms/domain/coursework";

import { LEARNER_TABS } from "@faridalms/domain/coursework";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, History } from "lucide-react";
import * as v from "valibot";

import { ByDay, DONE, TO_DO } from "~/components/coursework/LearnerList";
import { MyReading } from "~/components/reading/MyReading";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { myCourseworkQuery } from "~/queries/coursework";
import { myReadingQuery } from "~/queries/reading";
import { formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/me/assignments")({
  validateSearch: v.object({
    tab: v.fallback(v.optional(v.picklist(LEARNER_TABS), "to_do"), "to_do"),
    /** The work of classes that ended, in place of those still running. */
    ended: v.fallback(v.optional(v.boolean(), false), false),
  }),
  loaderDeps: ({ search }) => ({ ended: search.ended }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(myCourseworkQuery(deps.ended)),
      context.queryClient.ensureQueryData(myReadingQuery),
    ]);
  },
  component: ToDoPage,
});

const TAB_LABEL: Record<LearnerTab, () => string> = {
  to_do: m.courseworkTabToDo,
  missing: m.courseworkTabMissing,
  done: m.courseworkTabDone,
};

function ToDoPage() {
  const { tab, ended } = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const { rows } = useSuspenseQuery(myCourseworkQuery(ended)).data;
  const lists: Record<LearnerTab, typeof rows> = {
    to_do: rows.filter((row) => TO_DO.includes(row.state)),
    missing: rows.filter((row) => row.state === "missing"),
    done: rows.filter((row) => DONE.includes(row.state)).toReversed(),
  };
  const empty: Record<LearnerTab, string> = {
    to_do: m.courseworkNothingToDo(),
    missing: m.courseworkNothingMissing(),
    done: m.courseworkNothingDone(),
  };
  return (
    <Page width="list">
      <PageHeader
        title={m.courseworkToDoTitle()}
        description={m.courseworkToDoHint()}
        menu={[
          {
            label: ended
              ? m.courseworkCurrentClasses()
              : m.courseworkEndedClasses(),
            icon: History,
            onSelect: () => {
              void navigate({
                resetScroll: false,
                replace: true,
                search: (previous) => ({ ...previous, ended: !ended }),
              });
            },
          },
          {
            label: m.courseworkDownloadMine(),
            icon: Download,
            onSelect: () =>
              window.location.assign(`/exports/students/${user.id}`),
          },
        ]}
      />
      <RecordTabs
        label={m.courseworkSections()}
        tabs={LEARNER_TABS.map((value) => ({
          value,
          label: `${TAB_LABEL[value]()} ${formatNumber(lists[value].length)}`,
        }))}
        value={tab}
        onChange={(next) => {
          void navigate({
            resetScroll: false,
            replace: true,
            search: (previous) => ({ ...previous, tab: next }),
          });
        }}
      >
        <ByDay items={lists[tab]} linked empty={empty[tab]} />
      </RecordTabs>
      <div className="mt-6">
        <MyReading />
      </div>
    </Page>
  );
}
