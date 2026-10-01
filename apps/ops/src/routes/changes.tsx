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

function Changes() {
  const { changes, schools } = Route.useLoaderData();
  const names = new Map(
    schools.map((school) => [
      school.id,
      school.nameEn ?? school.nameAr ?? school.slug,
    ]),
  );
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Changes</h1>
        <p className="text-sm text-muted-foreground">
          Everything operators changed in the directory, newest first, with the
          reason given. Operators appear by an opaque id.
        </p>
      </div>
      <ChangeList changes={changes} schoolName={(id) => names.get(id) ?? id} />
    </div>
  );
}
