import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { createFileRoute } from "@tanstack/react-router";

import { gradesSections } from "~/components/gradebook/slots";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { currentUserQuery } from "~/queries/user";
import { filled } from "~/utils/extension";

const own = <T extends { followersOnly?: boolean; place: number }>(
  sections: readonly T[],
) =>
  sections
    .filter((section) => !section.followersOnly)
    .toSorted((a, b) => a.place - b.place);

export const Route = createFileRoute("/_app/me/grades")({
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    await Promise.all(
      own(filled(context.extensions, user.modules, gradesSections)).map(
        (section) => context.queryClient.ensureQueryData(section.query("")),
      ),
    );
  },
  component: MyGradesPage,
});

function MyGradesPage() {
  const sections = own(useSlot(gradesSections));
  return (
    <Page width="list">
      <PageHeader title={m.gradesTitle()} description={m.gradesHint()} />
      <div className="grid gap-10">
        {sections.map(({ key, Section }) => (
          <Section key={key} studentId="" />
        ))}
      </div>
    </Page>
  );
}
