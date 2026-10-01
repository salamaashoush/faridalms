import { FileFactsProvider } from "@faridalms/editor/file-facts";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { Shell } from "~/components/system/Shell";
import { currentUserQuery } from "~/queries/user";
import { getWorkspacePreferences } from "~/server/auth";
import { getFileFacts } from "~/server/files";

async function currentFacts(ids: string[]) {
  const { files } = await getFileFacts({ data: { ids } });
  return Object.fromEntries(
    files.map((file) => [
      file.id,
      { name: file.name, mime: file.mediaType, bytes: file.sizeBytes },
    ]),
  );
}

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    }
  },
  loader: async ({ context }) => {
    // The shell reads this synchronously via useSuspenseQuery, so it has to be
    // in the cache before the first render rather than suspending the layout.
    const preferences = getWorkspacePreferences();
    await context.queryClient.ensureQueryData(currentUserQuery);
    return preferences;
  },
  component: AppLayout,
});

// Pathless: it contributes no URL segment, only the auth gate and the chrome
// every signed-in route shares.
function AppLayout() {
  const preferences = Route.useLoaderData();
  return (
    <FileFactsProvider resolve={currentFacts}>
      <Shell sidebarOpen={preferences.sidebarOpen}>
        <Outlet />
      </Shell>
    </FileFactsProvider>
  );
}
