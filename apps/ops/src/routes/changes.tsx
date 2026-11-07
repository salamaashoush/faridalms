import type { Change } from "@faridalms/database/directory/admin";

import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { createFileRoute } from "@tanstack/react-router";

import { ChangeList } from "../components/ChangeList";
import { listChanges, listSchools } from "../server/directory";

export const Route = createFileRoute("/changes")({
  loader: async () => {
    const [{ changes, names }, schools] = await Promise.all([
      listChanges(),
      listSchools(),
    ]);
    return { changes, names, schools };
  },
  component: Changes,
});

/** Everything operators changed in the directory, newest first, with why. */
function Changes() {
  const { changes, names, schools } = Route.useLoaderData();
  const subjects = new Map<string, string>();
  for (const school of schools) {
    const name = school.nameEn ?? school.nameAr ?? school.slug;
    subjects.set(school.id, name);
    if (!subjects.has(school.tenantId))
      subjects.set(
        school.tenantId,
        school.tenantNameEn ?? school.tenantNameAr ?? name,
      );
  }
  const subjectName = (change: Change) =>
    subjects.get(change.subjectId) ?? change.subjectId;
  return (
    <Page width="list">
      <PageHeader
        title="Changes"
        description="Everything operators changed in the directory, newest first, with the reason given."
      />
      <RecordSection title="Change log">
        <ChangeList changes={changes} names={names} subjectName={subjectName} />
      </RecordSection>
    </Page>
  );
}
