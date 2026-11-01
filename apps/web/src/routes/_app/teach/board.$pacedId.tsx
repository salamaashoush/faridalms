import { createFileRoute } from "@tanstack/react-router";

import { PacedBoard } from "~/components/learning/PacedLesson";
import { pacedQuery } from "~/queries/learning";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";

/** The class board of a lesson led live, for the room's screen. */
export const Route = createFileRoute("/_app/teach/board/$pacedId")({
  staticData: { immersive: true },
  loader: async ({ context, params }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "learning:author");
    await context.queryClient.ensureQueryData(pacedQuery(params.pacedId));
  },
  component: BoardPage,
});

function BoardPage() {
  const { pacedId } = Route.useParams();
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <PacedBoard pacedId={pacedId} />
    </div>
  );
}
