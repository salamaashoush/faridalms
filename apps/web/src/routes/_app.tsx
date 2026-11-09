import { pictureSrcSet } from "@faridalms/domain/previews";
import {
  FileFactsProvider,
  PictureSourcesProvider,
} from "@faridalms/editor/file-facts";
import {
  createFileRoute,
  notFound,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { SchoolMediaProvider } from "~/components/media/MediaPicker";
import { Shell } from "~/components/system/Shell";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { currentUserQuery } from "~/queries/user";
import { getWorkspacePreferences } from "~/server/auth";
import { getFileFacts } from "~/server/files";
import { leaveBareDomain } from "~/utils/bare-domain";
import { adoptSchoolZone } from "~/utils/datetime";
import { rememberDigits } from "~/utils/digits";
import { pageOn } from "~/utils/modules";

async function currentFacts(ids: string[]) {
  const { files } = await getFileFacts({ data: { ids } });
  return Object.fromEntries(
    files.map(({ id, mediaType, sizeBytes, ...facts }) => [
      id,
      { ...facts, mime: mediaType, bytes: sizeBytes },
    ]),
  );
}

/** Every picture of the school is fetched at the width its place needs. */
const pictureSources = (fileId: string) => ({
  srcSet: pictureSrcSet(`/files/${fileId}`),
});

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    leaveBareDomain(context.auth, location.href);
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    }
    // A page of a module the school does not have is not there, as its API
    // answers; the navigation hides it from the same list.
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!pageOn(user.modules, location.pathname)) throw notFound();
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
  const { digits, timeZone } = useCurrentUser().school;
  adoptSchoolZone(timeZone);
  // A page drawn before the browser knew the school's digits, or after the
  // school changed them, is drawn again in them; it happens once a change.
  useEffect(() => {
    if (rememberDigits(digits)) window.location.reload();
  }, [digits]);
  return (
    <FileFactsProvider resolve={currentFacts}>
      <PictureSourcesProvider value={pictureSources}>
        <SchoolMediaProvider>
          <Shell
            sidebarOpen={preferences.sidebarOpen}
            moreOpen={preferences.moreOpen}
          >
            <Outlet />
          </Shell>
        </SchoolMediaProvider>
      </PictureSourcesProvider>
    </FileFactsProvider>
  );
}
