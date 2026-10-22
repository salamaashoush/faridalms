import { cn } from "@faridalms/ui/cn";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { LessonPreview } from "~/components/learning/LessonPlayer";
import { lessonEditorQuery } from "~/queries/learning";

/**
 * A lesson as a student meets it on another screen or in another language,
 * framed in its teacher's preview: the frame's width is the screen's, and
 * its language comes from `ui` (see preview-locale.ts).
 */
export const Route = createFileRoute("/_app/lesson-frame/$lessonId")({
  staticData: { immersive: true },
  validateSearch: v.object({
    ui: v.optional(v.picklist(["en", "ar"])),
    theme: v.optional(v.picklist(["light", "dark"])),
  }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      lessonEditorQuery(params.lessonId),
    );
  },
  component: FramePage,
});

function FramePage() {
  const { lessonId } = Route.useParams();
  const { theme } = Route.useSearch();
  return (
    <div
      className={cn(
        "min-h-dvh bg-background px-4 py-6 text-foreground",
        theme === "dark" && "dark",
      )}
    >
      <LessonPreview lessonId={lessonId} framed />
    </div>
  );
}
