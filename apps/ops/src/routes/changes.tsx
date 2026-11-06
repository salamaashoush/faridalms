import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { createFileRoute } from "@tanstack/react-router";

import { ChangeList } from "../components/ChangeList";
import { listChanges, listSchools } from "../server/directory";

export const Route = createFileRoute("/changes")({
  loader: async () => {
    const [changes, schools] = await Promise.all([
      listChanges(),
      listSchools(),
    ]);
    return { changes, schools };
  },
  component: Changes,
});

/** Everything operators changed in the directory, newest first, with why. */
function Changes() {
  const { changes, schools } = Route.useLoaderData();
  const names = new Map(
    schools.map((school) => [
      school.id,
      school.nameEn ?? school.nameAr ?? school.slug,
    ]),
  );
  return (
    <div className="grid max-w-4xl">
      <PageHeader
        title="Changes"
        description="Everything operators changed in the directory, newest first, with the reason given."
      />
      <RecordSection title="Change log">
        <ChangeList
          changes={changes}
          subjectName={(id) => names.get(id) ?? id}
        />
      </RecordSection>
    </div>
  );
}
