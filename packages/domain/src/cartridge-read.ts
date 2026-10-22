/**
 * What a Common Cartridge holds, read from its manifest the way Canvas and
 * Moodle read one: its course organised into modules, each a list of
 * items, and what each item is. Versions 1.0 to 1.3 differ in names, so
 * types are matched by their stem, and namespaces are passed over.
 */

export type CartridgeItem =
  | { kind: "page"; title: string; path: string }
  | { kind: "file"; title: string; path: string }
  | { kind: "link"; title: string; url: string }
  | { kind: "discussion"; title: string; html: string; base: string }
  | {
      kind: "assignment";
      title: string;
      html: string;
      base: string;
      points: number | null;
    }
  | { kind: "quiz"; title: string; path: string }
  | { kind: "tool"; title: string; url: string; description: string };

export interface CartridgeModule {
  title: string;
  items: CartridgeItem[];
}

export interface Cartridge {
  title: string;
  modules: CartridgeModule[];
}

/** A path inside a package, from a file's own path and a link in it. */
export function packagePath(from: string, href: string): string {
  const base = from.split("/").slice(0, -1);
  let link = href.split("#")[0]?.split("?")[0] ?? "";
  try {
    link = decodeURIComponent(link);
  } catch {
    // A link with a stray percent sign is taken as it is written.
  }
  for (const part of link.split("/")) {
    if (part === "..") base.pop();
    else if (part && part !== ".") base.push(part);
  }
  return base.join("/");
}

/** CC's own references to the package's files, in every spelling LMSs wrote. */
const FILEBASE = /^\$(?:IMS|1EdTech)[-_]CC[-_]FILEBASE\$/iu;

/**
 * The package file a link in a page or descriptor points at: relative to
 * where it was written, else to the package's root, else by the end of its
 * path, as Canvas writes its own links.
 */
export function cartridgeFile(
  files: ReadonlySet<string>,
  from: string,
  href: string,
): string | null {
  const plain = href.trim();
  if (!plain || /^[a-z][a-z0-9+.-]*:/iu.test(plain) || plain.startsWith("//"))
    return null;
  const tokened = FILEBASE.test(plain);
  const link = plain.replace(FILEBASE, "");
  const candidates = [
    packagePath(from, link),
    packagePath("", link.replace(/^\/+/u, "")),
  ];
  for (const candidate of candidates)
    if (files.has(candidate)) return candidate;
  if (!tokened && !link.includes("/")) return null;
  const tail = packagePath("", link.replaceAll("../", "").replace(/^\/+/u, ""));
  return (
    [...files].find((path) => path === tail || path.endsWith(`/${tail}`)) ??
    null
  );
}

const named = (element: Element, name: string) =>
  Array.from(element.getElementsByTagName("*")).filter(
    (child) => child.localName === name,
  );
const childrenNamed = (element: Element, name: string) =>
  Array.from(element.children).filter((child) => child.localName === name);

const decoder = new TextDecoder();

interface Resource {
  type: string;
  href: string;
  files: string[];
}

/** Reads a descriptor file, an XML document a resource names. */
function descriptor(
  files: ReadonlyMap<string, Uint8Array>,
  path: string | undefined,
): Element | null {
  const bytes = path ? files.get(path) : undefined;
  if (!bytes) return null;
  const document = new DOMParser().parseFromString(
    decoder.decode(bytes),
    "application/xml",
  );
  return document.getElementsByTagName("parsererror").length > 0
    ? null
    : document.documentElement;
}

const text = (element: Element | undefined) =>
  element?.textContent.trim() ?? "";

function itemOf(
  title: string,
  resource: Resource,
  files: ReadonlyMap<string, Uint8Array>,
  identifier: string,
): CartridgeItem | null {
  const type = resource.type;
  const main = resource.href || resource.files[0] || "";
  if (type.endsWith("assessment")) {
    // Canvas keeps every kind of question in a file of its own beside the
    // profiled one, and prefers it, as this does.
    const full = `non_cc_assessments/${identifier}.xml.qti`;
    const path = [...files.keys()].find((each) => each.endsWith(full)) ?? main;
    return path ? { kind: "quiz", title, path } : null;
  }
  if (type.startsWith("imswl")) {
    const root = descriptor(files, main);
    const url = root ? (named(root, "url")[0]?.getAttribute("href") ?? "") : "";
    return url
      ? {
          kind: "link",
          title: text(root ? named(root, "title")[0] : undefined) || title,
          url,
        }
      : null;
  }
  if (type.startsWith("imsdt")) {
    const root = descriptor(files, main);
    if (!root) return null;
    return {
      kind: "discussion",
      title: text(named(root, "title")[0]) || title,
      html: text(named(root, "text")[0]),
      base: main,
    };
  }
  if (type.startsWith("imsbasiclti")) {
    const root = descriptor(files, main);
    if (!root) return null;
    return {
      kind: "tool",
      title: text(named(root, "title")[0]) || title,
      description: text(named(root, "description")[0]),
      url:
        text(named(root, "secure_launch_url")[0]) ||
        text(named(root, "launch_url")[0]),
    };
  }
  if (type.startsWith("assignment")) {
    const root = descriptor(files, main);
    if (!root) return null;
    const points = Number(
      named(root, "gradable")[0]?.getAttribute("points_possible"),
    );
    return {
      kind: "assignment",
      title: text(childrenNamed(root, "title")[0]) || title,
      html: text(childrenNamed(root, "text")[0]),
      base: main,
      points: Number.isFinite(points) ? points : null,
    };
  }
  if (type === "webcontent" || type.endsWith("learning-application-resource")) {
    const page = [main, ...resource.files].find((path) =>
      /\.x?html?$/iu.test(path),
    );
    if (page) {
      // Canvas's assignments are a page beside their settings.
      const settings = resource.files.find((path) =>
        path.endsWith("assignment_settings.xml"),
      );
      if (settings) {
        const root = descriptor(files, settings);
        const points = Number(
          text(root ? named(root, "points_possible")[0] : undefined),
        );
        const bytes = files.get(page);
        return {
          kind: "assignment",
          title: text(root ? named(root, "title")[0] : undefined) || title,
          html: bytes ? decoder.decode(bytes) : "",
          base: page,
          points: Number.isFinite(points) && points > 0 ? points : null,
        };
      }
      return { kind: "page", title, path: page };
    }
    return main ? { kind: "file", title, path: main } : null;
  }
  return null;
}

/**
 * A package's course, from its manifest; none when it is not a Common
 * Cartridge. A module is each folder at the top of the course; items
 * outside any folder gather in one module named after the course.
 */
export function readCartridge(
  files: ReadonlyMap<string, Uint8Array>,
): Cartridge | null {
  const manifestPath = [...files.keys()]
    .filter((path) => path.split("/").at(-1) === "imsmanifest.xml")
    .toSorted((a, b) => a.length - b.length)[0];
  const manifest = manifestPath ? descriptor(files, manifestPath) : null;
  if (!manifestPath || !manifest) return null;
  const schema = text(named(manifest, "schema")[0]);
  if (!/common cartridge/iu.test(schema)) return null;
  const resources = new Map<string, Resource>();
  for (const resource of named(manifest, "resource")) {
    const href = resource.getAttribute("href");
    resources.set(resource.getAttribute("identifier") ?? "", {
      type: resource.getAttribute("type") ?? "",
      href: href ? packagePath(manifestPath, href) : "",
      files: childrenNamed(resource, "file").map((file) =>
        packagePath(manifestPath, file.getAttribute("href") ?? ""),
      ),
    });
  }
  const general = named(manifest, "general")[0];
  const courseTitle =
    text(general ? named(general, "title")[0] : undefined) || "Course";
  const organization = named(manifest, "organization")[0];
  let tops = organization ? childrenNamed(organization, "item") : [];
  // Most cartridges wrap their modules in one root item.
  const [root] = tops;
  if (tops.length === 1 && root && !root.getAttribute("identifierref"))
    tops = childrenNamed(root, "item");
  const titleOf = (item: Element) => text(childrenNamed(item, "title")[0]);
  const leavesOf = (item: Element): CartridgeItem[] =>
    childrenNamed(item, "item").flatMap((child) => {
      const ref = child.getAttribute("identifierref");
      if (!ref) return leavesOf(child);
      const resource = resources.get(ref);
      const read = resource
        ? itemOf(titleOf(child), resource, files, ref)
        : null;
      return read ? [read] : [];
    });
  const modules: CartridgeModule[] = [];
  const loose: CartridgeItem[] = [];
  for (const top of tops) {
    const ref = top.getAttribute("identifierref");
    if (ref) {
      const resource = resources.get(ref);
      const read = resource ? itemOf(titleOf(top), resource, files, ref) : null;
      if (read) loose.push(read);
      continue;
    }
    const items = leavesOf(top);
    if (items.length > 0)
      modules.push({ title: titleOf(top) || courseTitle, items });
  }
  if (loose.length > 0) modules.push({ title: courseTitle, items: loose });
  return { title: courseTitle, modules };
}
