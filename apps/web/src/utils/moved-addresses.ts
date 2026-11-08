/**
 * Staff once worked in two areas, `/admin` and `/teach`, which are now one
 * at the root. Their addresses live on in bookmarks and sent emails, so each
 * still lands on the page that took its place, on the side it showed.
 */
export type MovedArea = "admin" | "teach";

const RENAMED: Record<string, string> = { site: "website" };

/** The side of a merged page each area's address showed. */
const SIDE: Record<MovedArea, Record<string, [string, string]>> = {
  admin: {
    classes: ["scope", "all"],
    attendance: ["tab", "registers"],
    timetable: ["view", "classes"],
  },
  teach: {
    classes: ["scope", "mine"],
    attendance: ["tab", "mine"],
    timetable: ["view", "mine"],
  },
};

/** Where an old address in one of the areas now lands, its search kept. */
export function movedAddress(
  area: MovedArea,
  pathname: string,
  searchStr: string,
): string {
  const rest = pathname.slice(`/${area}`.length).replace(/^\/+|\/+$/g, "");
  if (rest === "") return `/today${searchStr}`;
  const [first = "", ...tail] = rest.split("/");
  const path = `/${[RENAMED[first] ?? first, ...tail].join("/")}`;
  const search = new URLSearchParams(searchStr);
  const side = tail.length === 0 ? SIDE[area][first] : undefined;
  if (side && !search.has(side[0])) search.set(side[0], side[1]);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
