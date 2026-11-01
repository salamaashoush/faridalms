/**
 * What the page's host is to the platform, as the server resolved it when
 * the request arrived. The browser learns it with the page.
 */
export interface HostView {
  /**
   * The school whose public website this host serves at its root paths, or
   * null on a portal, where the website lives under `/site/<school>`.
   */
  site: string | null;
  /** How the page was reached, for links to the school's other hosts. */
  protocol: "http:" | "https:";
  port: string;
  /** True on the bare portal domain of a platform that serves its product site there. */
  product?: boolean;
}

let held: HostView = { site: null, protocol: "https:", port: "" };
let source: () => HostView = () => held;

/**
 * Where the view comes from while the server draws a page: the request's
 * own, so two hosts' pages drawn at once keep theirs.
 */
export function overwriteHostSource(read: () => HostView) {
  source = read;
}

/** Takes the view the server sent with the page, before the router reads its address. */
export function adoptHostView(view: HostView) {
  held = view;
}

export const hostView = (): HostView => source();

const WEBSITE = "/site/";

// Served as they are on a website's host: the published pictures its pages show.
const AS_THEY_ARE = ["/public-media/"];

/** The router's path for an address on a school's website host. */
export function sitePathIn(pathname: string, school: string): string {
  if (AS_THEY_ARE.some((prefix) => pathname.startsWith(prefix)))
    return pathname;
  return pathname === "/"
    ? `${WEBSITE}${school}`
    : `${WEBSITE}${school}${pathname}`;
}

/** The address on a school's website host for one of the router's paths. */
export function sitePathOut(pathname: string, school: string): string {
  const base = `${WEBSITE}${school}`;
  if (pathname === base || pathname === `${base}/`) return "/";
  return pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length)
    : pathname;
}

/**
 * A path inside a school's website, as this host addresses it: from the
 * root on the website's own host, under `/site/<school>` anywhere else.
 */
export function sitePath(school: string, path: string): string {
  if (hostView().site === school) return path;
  return path === "/" ? `${WEBSITE}${school}` : `${WEBSITE}${school}${path}`;
}

/**
 * An address on another of the school's hosts, reached the way this page
 * was: every host is served by the same web server, so in development the
 * scheme and port carry over, and in production they are HTTPS and none.
 */
export function hostHref(hostname: string, path: string): string {
  const { protocol, port } = hostView();
  return `${protocol}//${hostname}${port ? `:${port}` : ""}${path}`;
}

/** The address a visitor sees for one of the router's website paths. */
export function publicPath(pathname: string, school: string): string {
  return hostView().site === school ? sitePathOut(pathname, school) : pathname;
}

/**
 * Whether a link inside a school's website turns one of its pages, which the
 * router can do without reloading the site.
 */
export function insideWebsite(href: string, school: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  if (hostView().site === school)
    return !AS_THEY_ARE.some((prefix) => href.startsWith(prefix));
  const base = `${WEBSITE}${school}`;
  return href.startsWith(base) && /^(?:$|[/?#])/.test(href.slice(base.length));
}
