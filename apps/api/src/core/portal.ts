import type { DirectorySchool } from "@faridalms/database/directory/client";
import type { PlatformDomains } from "@faridalms/domain/hosts";

import { platformName } from "@faridalms/domain/hosts";

type Addressed = Pick<DirectorySchool, "slug" | "hosts">;

/**
 * The hostname a school's portal answers on for links: its own canonical
 * portal host once that is active, otherwise its platform name.
 */
export function portalHost(school: Addressed, domains: PlatformDomains) {
  return school.hosts.portal ?? platformName(school.slug, "portal", domains);
}

/** The origin every absolute link into a school's portal starts with. */
export function portalOrigin(school: Addressed, domains: PlatformDomains) {
  return `https://${portalHost(school, domains)}`;
}

/** A page of the school's portal, as links in email and exports reach it. */
export function portalUrl(
  school: Addressed,
  domains: PlatformDomains,
  path: string,
) {
  return new URL(path, portalOrigin(school, domains));
}

/**
 * The page that chooses a password from an emailed link. The secret rides in
 * the fragment, which browsers never send, so it stays out of request logs.
 */
export function welcomeLink(
  school: Addressed,
  domains: PlatformDomains,
  secret: string,
  /** The intake a registering family came to apply for. */
  intake?: string,
) {
  const url = portalUrl(school, domains, "/welcome");
  if (intake) url.searchParams.set("intake", intake);
  url.hash = secret;
  return url.toString();
}
