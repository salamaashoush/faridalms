import type { DirectorySchool } from "@faridalms/database/directory/client";

/** A page of the school's portal, as links in email and exports reach it. */
export function portalUrl(
  school: Pick<DirectorySchool, "appHost" | "slug">,
  path: string,
) {
  const url = new URL(path, `https://${school.appHost}`);
  url.searchParams.set("school", school.slug);
  return url;
}

/**
 * The page that chooses a password from an emailed link. The secret rides in
 * the fragment, which browsers never send, so it stays out of request logs.
 */
export function welcomeLink(
  school: Pick<DirectorySchool, "appHost" | "slug">,
  secret: string,
) {
  const url = portalUrl(school, "/welcome");
  url.hash = secret;
  return url.toString();
}
