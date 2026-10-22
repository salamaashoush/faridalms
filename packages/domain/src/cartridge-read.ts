/**
 * What a Common Cartridge holds, read from its manifest the way Canvas and
 * Moodle read one: its course organised into modules, each a list of
 * items, and what each item is. Versions 1.0 to 1.3 differ in names, so
 * types are matched by their stem, and namespaces are passed over.
 */

/** How students hand an assignment in: written online, as files, both, or not at all. */
export type CartridgeSubmission = "online" | "files" | "both" | "none";

/**
 * What finishes an item, as Canvas sets it on a module: opening it, the
 * student saying so, handing it in, or a share of its points, which is
 * null when the quiz's points are not known.
 */
export type CartridgeRule =
  | { rule: "view" | "mark" | "submit" }
  | { rule: "score"; percent: number | null };

export type CartridgeItem = (
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
      /** When it is due, as an instant; null when the package names none. */
      dueAt: string | null;
      submission: CartridgeSubmission;
    }
  | { kind: "quiz"; title: string; path: string }
  | { kind: "tool"; title: string; url: string; description: string }
) & { completion?: CartridgeRule };

export interface CartridgeModule {
  title: string;
  items: CartridgeItem[];
  /** Its items are taken in order, each once the one before is finished. */
  sequential?: boolean;
  /** The earlier modules, by their place in the course, to finish first. */
  prerequisites?: number[];
}

/** A bank of questions a course keeps apart from its quizzes, to draw on. */
export interface CartridgeBank {
  title: string;
  path: string;
}

export interface Cartridge {
  title: string;
  modules: CartridgeModule[];
  banks: CartridgeBank[];
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

/** How students hand work in, from CC's formats or Canvas's submission types. */
function submissionOf(types: readonly string[]): CartridgeSubmission {
  if (types.length === 0) return "both";
  const online = types.some((type) =>
    ["text", "html", "url", "online_text_entry", "online_url"].includes(type),
  );
  const files = types.some((type) => ["file", "online_upload"].includes(type));
  return online && files
    ? "both"
    : online
      ? "online"
      : files
        ? "files"
        : "none";
}

/** A Canvas date, written in UTC without saying so, as an instant. */
function instantOf(value: string): string | null {
  if (!value) return null;
  const zoned = /(?:[zZ]|[+-]\d\d:?\d\d)$/u.test(value) ? value : `${value}Z`;
  const time = Date.parse(zoned);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

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
    // Canvas keeps the due date in its own block among the extensions.
    const canvas = named(root, "extensions")[0];
    return {
      kind: "assignment",
      title: text(childrenNamed(root, "title")[0]) || title,
      html: text(childrenNamed(root, "text")[0]),
      base: main,
      points: Number.isFinite(points) && points > 0 ? points : null,
      dueAt: instantOf(text(canvas ? named(canvas, "due_at")[0] : undefined)),
      submission: submissionOf(
        named(root, "format").map(
          (format) => format.getAttribute("type") ?? "",
        ),
      ),
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
        const field = (name: string) =>
          text(root ? named(root, name)[0] : undefined);
        return {
          kind: "assignment",
          title: field("title") || title,
          html: bytes ? decoder.decode(bytes) : "",
          base: page,
          points: Number.isFinite(points) && points > 0 ? points : null,
          dueAt: instantOf(field("due_at")),
          submission: submissionOf(
            field("submission_types").split(",").filter(Boolean),
          ),
        };
      }
      return { kind: "page", title, path: page };
    }
    return main ? { kind: "file", title, path: main } : null;
  }
  return null;
}

/**
 * A module's name: its folder's title, or the course's where it has none.
 * Moodle names an unnamed section by its number alone, the first 0, so
 * those read as the course's sections.
 */
function moduleTitle(title: string, courseTitle: string): string {
  if (!title || title === "0") return courseTitle;
  return /^\d+$/u.test(title) ? `${courseTitle} ${title}` : title;
}

type MetaRule =
  | { rule: "view" | "mark" | "submit" }
  | { rule: "score"; percent: number | null; minScore?: number };

/**
 * Canvas's own record of its modules, beside the manifest: which must be
 * finished first, which run in order, and what finishes each item, by the
 * identifiers the manifest's organization gives them.
 */
function canvasModules(
  files: ReadonlyMap<string, Uint8Array>,
  manifestPath: string,
): {
  modules: Map<string, { sequential: boolean; prerequisites: string[] }>;
  rules: Map<string, MetaRule>;
} {
  const modules = new Map<
    string,
    { sequential: boolean; prerequisites: string[] }
  >();
  const rules = new Map<string, MetaRule>();
  const root = descriptor(
    files,
    packagePath(manifestPath, "course_settings/module_meta.xml"),
  );
  if (!root) return { modules, rules };
  for (const module of named(root, "module")) {
    modules.set(module.getAttribute("identifier") ?? "", {
      sequential:
        text(named(module, "require_sequential_progress")[0]) === "true",
      prerequisites: named(module, "prerequisite")
        .filter((each) => each.getAttribute("type") === "context_module")
        .map((each) => text(named(each, "identifierref")[0])),
    });
    for (const requirement of named(module, "completionRequirement")) {
      const item = text(named(requirement, "identifierref")[0]);
      const type = requirement.getAttribute("type") ?? "";
      const minScore = Number(text(named(requirement, "min_score")[0]));
      const minPercent = Number(text(named(requirement, "min_percentage")[0]));
      const rule: MetaRule | null =
        type === "must_view" || type === "must_contribute"
          ? { rule: "view" }
          : type === "must_mark_done"
            ? { rule: "mark" }
            : type === "must_submit"
              ? { rule: "submit" }
              : type === "min_percentage" && minPercent > 0
                ? {
                    rule: "score",
                    percent: Math.min(100, Math.max(1, Math.round(minPercent))),
                  }
                : type === "min_score" && minScore > 0
                  ? { rule: "score", percent: null, minScore }
                  : null;
      if (item && rule) rules.set(item, rule);
    }
  }
  return { modules, rules };
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
  const meta = canvasModules(files, manifestPath);
  /** What finishes an item, its quiz's points read for a minimum score. */
  const ruleOf = (
    identifier: string,
    ref: string,
  ): CartridgeRule | undefined => {
    const set = meta.rules.get(identifier);
    if (!set) return undefined;
    if (set.rule !== "score") return { rule: set.rule };
    if (set.percent !== null || !set.minScore)
      return { rule: "score", percent: set.percent };
    const settings = resources
      .get(ref)
      ?.files.find((path) => path.endsWith("assessment_meta.xml"));
    const quiz = descriptor(files, settings);
    const points = Number(
      text(quiz ? named(quiz, "points_possible")[0] : undefined),
    );
    return {
      rule: "score",
      percent:
        points > 0
          ? Math.min(
              100,
              Math.max(1, Math.round((set.minScore / points) * 100)),
            )
          : null,
    };
  };
  const read = (item: Element, ref: string): CartridgeItem | null => {
    const resource = resources.get(ref);
    const found = resource ? itemOf(titleOf(item), resource, files, ref) : null;
    if (!found) return null;
    const completion = ruleOf(item.getAttribute("identifier") ?? "", ref);
    return completion ? { ...found, completion } : found;
  };
  const leavesOf = (item: Element): CartridgeItem[] =>
    childrenNamed(item, "item").flatMap((child) => {
      const ref = child.getAttribute("identifierref");
      if (!ref) return leavesOf(child);
      const found = read(child, ref);
      return found ? [found] : [];
    });
  const modules: CartridgeModule[] = [];
  const places = new Map<string, number>();
  const loose: CartridgeItem[] = [];
  for (const top of tops) {
    const ref = top.getAttribute("identifierref");
    if (ref) {
      const found = read(top, ref);
      if (found) loose.push(found);
      continue;
    }
    const items = leavesOf(top);
    if (items.length === 0) continue;
    const identifier = top.getAttribute("identifier") ?? "";
    const rules = meta.modules.get(identifier);
    const prerequisites = (rules?.prerequisites ?? []).flatMap((each) => {
      const place = places.get(each);
      return place === undefined ? [] : [place];
    });
    places.set(identifier, modules.length);
    modules.push({
      title: moduleTitle(titleOf(top), courseTitle),
      items,
      ...(rules?.sequential ? { sequential: true } : {}),
      ...(prerequisites.length ? { prerequisites } : {}),
    });
  }
  if (loose.length > 0) modules.push({ title: courseTitle, items: loose });
  return {
    title: courseTitle,
    modules,
    banks: banksOf(files, resources, modules, courseTitle),
  };
}

/** A QTI 1.2 bank's name: Canvas's own field, else its title, else none. */
function bankTitle(root: Element): string {
  const field = named(root, "qtimetadatafield").find(
    (each) => text(named(each, "fieldlabel")[0]) === "bank_title",
  );
  return (
    text(field ? named(field, "fieldentry")[0] : undefined) ||
    (named(root, "objectbank")[0]?.getAttribute("title") ?? "").trim()
  );
}

/**
 * The course's question banks: CC's own, kept as resources outside the
 * course, and Canvas's, which it writes beside its full quizzes.
 */
function banksOf(
  files: ReadonlyMap<string, Uint8Array>,
  resources: ReadonlyMap<string, Resource>,
  modules: readonly CartridgeModule[],
  courseTitle: string,
): CartridgeBank[] {
  const asked = new Set(
    modules.flatMap((module) =>
      module.items.flatMap((item) => (item.kind === "quiz" ? [item.path] : [])),
    ),
  );
  const paths = [
    ...[...resources.values()].flatMap((resource) =>
      resource.type.endsWith("question-bank")
        ? [resource.href || resource.files[0] || ""]
        : [],
    ),
    ...[...files.keys()].filter((path) =>
      /(?:^|\/)non_cc_assessments\/[^/]+\.xml\.qti$/u.test(path),
    ),
  ];
  const banks: CartridgeBank[] = [];
  for (const path of new Set(paths)) {
    if (!path || asked.has(path)) continue;
    const root = descriptor(files, path);
    if (!root || named(root, "objectbank").length === 0) continue;
    banks.push({ title: bankTitle(root) || courseTitle, path });
  }
  return banks;
}
