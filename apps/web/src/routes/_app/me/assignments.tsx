import type { LearnerTab } from "@faridalms/domain/coursework";

import { LEARNER_TABS } from "@faridalms/domain/coursework";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import * as v from "valibot";

import { ByDay, DONE, TO_DO } from "~/components/coursework/LearnerList";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { myCourseworkQuery } from "~/queries/coursework";
import { formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/me/assignments")({
  validateSearch: v.object({
    tab: v.fallback(v.optional(v.picklist(LEARNER_TABS), "to_do"), "to_do"),
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(myCourseworkQuery);
  },
  component: ToDoPage,
});

const TAB_LABEL: Record<LearnerTab, () => string> = {
  to_do: m.courseworkTabToDo,
  missing: m.courseworkTabMissing,
  done: m.courseworkTabDone,
};

function ToDoPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const { rows } = useSuspenseQuery(myCourseworkQuery).data;
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
    <>
      <PageHeader
        title={m.courseworkToDoTitle()}
        description={m.courseworkToDoHint()}
        menu={[
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
          void navigate({ search: { tab: next } });
        }}
      >
        <ByDay items={lists[tab]} linked empty={empty[tab]} />
      </RecordTabs>
    </>
  );
}
