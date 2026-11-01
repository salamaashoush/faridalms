/**
 * Fetches what the files host serves the micro:bit editor from, into
 * apps/api/vendor/makecode: the MakeCode editor (`pxt-core`) and its
 * micro:bit target (`pxt-microbit`) as published on npm, each pinned by
 * version and checksum. Both packages carry the editor already built, so
 * nothing is compiled here: the files are laid out as the editor's own
 * static packaging lays them (`pxt staticpkg`, uploadCoreAsync in
 * pxt/cli/cli.ts), under the address the files host gives them.
 *
 * Three things differ from that packaging, each so that a school's copy
 * reaches no server but its own and passes for nobody else's:
 *
 * - The page is ours. The editor's own starts its usage reporting and
 *   holds inline scripts, which the files host's policy refuses.
 * - The names, logos and links of Microsoft and of the Micro:bit
 *   Educational Foundation are taken out, as their trademark rules ask of a
 *   copy neither of them runs, with everything that calls their services:
 *   sharing, sign-in, extensions fetched from GitHub, live translations.
 * - Arabic is fetched once, here, from the editor's translation service,
 *   and served with the rest.
 *
 *   bun apps/api/scripts/makecode.ts
 *
 * Install runs it, and it does nothing when the pinned editor is there.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";

const CORE = {
  name: "pxt-core",
  version: "13.2.17",
  sha512:
    "5bdFP6RAp1BGAZvBVgMHCV3ezUG3PY7GBUDm55U3BYVtdmHB0QP1gjUtPx6qDcjHXGPkPgAVePY0LYM31MD0JQ==",
};
const TARGET = {
  name: "pxt-microbit",
  version: "9.1.2",
  sha512:
    "G39c4QbXOnlQxLk3cao25nmXr/PWRdYQhGi8l3UDxNZWT8vbtJbnmT1fe8B1XlUzmZDVxuS4HqfnpXgTbuZ3Wg==",
};
/** Raised whenever what this script makes of the two packages changes. */
const LAYOUT = 1;
const PINNED = `${TARGET.version}+${CORE.version}+${LAYOUT}`;

/** Where the files host serves the editor, as apps/api/src/files/makecode.ts has it. */
const BASE = "/makecode/";
const OUT = new URL("../vendor/makecode/", import.meta.url).pathname;
const STAMP = join(OUT, "VERSION");
const SITE = join(OUT, "editor");
const UNPACKED = join(OUT, "unpacked");

/** The languages served beside English, which the editor carries itself. */
const LANGUAGES = ["ar"];
const TRANSLATIONS = "https://makecode.com/api/translations";
const CONCURRENCY = 4;
const ATTEMPTS = 4;

async function unpack(
  pack: typeof CORE,
  glob: string[],
): Promise<{ root: string; files: string[] }> {
  const url = `https://registry.npmjs.org/${pack.name}/-/${pack.name}-${pack.version}.tgz`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const tarball = new Uint8Array(await response.arrayBuffer());
  const sum = createHash("sha512").update(tarball).digest("base64");
  if (sum !== pack.sha512)
    throw new Error(
      `${pack.name} ${pack.version}: the tarball hashes to ${sum}`,
    );
  const into = join(UNPACKED, pack.name);
  await new Bun.Archive(tarball).extract(into, { glob });
  const root = join(into, "package");
  const files = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)));
  return { root, files: files.toSorted() };
}

/**
 * The name a packaged file is served under: the editor's web files and
 * every package's `public` folder are laid flat at the root.
 */
const servedAs = (path: string) =>
  path.replace(/^.*(built\/web\/|\w+\/public\/|built\/)/, "");

// Left out: the service workers, which the files host refuses anyway, the
// usage reporting, the editor's other pages, each with inline scripts the
// policy refuses, the code and styles only those pages load, and the
// pictures of other makers' products, which nothing here shows.
const LEFT_OUT = [
  /serviceworker\.js$/,
  /^ai\.2\.min\.js$/,
  /^pxtweb\.(js|d\.ts)$/,
  /^(pxtembed|runnerembed|pxtasseteditor)\.js$/,
  /^(rtl)?react-common-(authcode|multiplayer|skillmap)\.css$/,
  /^(?!simulator\.html$)[^/]+\.html$/,
  /^targetlight\.(js|json)$/,
  /^(release|sim)\.manifest$/,
  /^block-tests\.js$/,
  /^favicon\.ico$/,
  /^images\/(?!Bars_black\.gif$)/,
  /\.d\.ts$/,
];

const TEXT = /\.(html?|js|css|json|webmanifest|svg|xml)$/;
/** The files the editor's packaging rewrites addresses in. */
const REWRITTEN = new Set([
  "embed.js",
  "worker.js",
  "monacoworker.js",
  "simulator.html",
  "sim.webmanifest",
  "workerConfig.js",
]);

interface Bundle {
  id: string;
  versions: { pxt: string; target: string };
  /** The packages that come with the editor, each a folder under `libs`. */
  bundleddirs: string[];
  appTheme: Record<string, unknown>;
  cloud: Record<string, unknown>;
  simulator: Record<string, unknown>;
  colorThemeMap?: Record<string, { overrideCss?: string }>;
  bundledpkgs: Record<string, Record<string, string>>;
}

const BUNDLE_PREFIX = "var pxtTargetBundle = ";

// Every name, logo and link of the editor's makers and of the board's, and
// the pictures the editor's own site would serve.
const THEIRS = [
  "logo",
  "logoUrl",
  "docsLogo",
  "portraitLogo",
  "footerLogo",
  "cardLogo",
  "appLogo",
  "organization",
  "organizationUrl",
  "organizationLogo",
  "organizationWideLogo",
  "homeScreenHero",
  "homeScreenHeroGallery",
  "embedUrl",
  "shareUrl",
  "privacyUrl",
  "termsOfUseUrl",
  "githubUrl",
  "appStoreID",
  "mobileSafariDownloadProtocol",
  "crowdinProject",
  "socialOptions",
  "usbDocs",
  "appFlashingTroubleshoot",
  "winAppDeprImage",
  "cloudProfileIcon",
  "tours",
  "TOC",
  // The reference pages are on the editor's own site, which is not here.
  // The menu is taken out rather than left empty: the editor would draw
  // the nothing it holds as a nought in its bar.
  "docMenu",
];

/**
 * The target as a school's own copy serves it: nobody's name or logo on
 * it, and nothing switched on that needs a service this copy does not run.
 */
function ownTarget(text: string, script: boolean): string {
  const bundle = JSON.parse(
    script ? text.slice(BUNDLE_PREFIX.length) : text,
  ) as Bundle;
  const theme = bundle.appTheme;
  for (const key of THEIRS) delete theme[key];
  Object.assign(theme, {
    title: "micro:bit code editor",
    name: "micro:bit code editor",
    description:
      "A blocks, JavaScript and Python code editor for the micro:bit.",
    homeUrl: BASE,
    hasReferenceDocs: false,
    // The lesson sets the language, from the ones served here.
    selectLanguage: false,
    availableLocales: ["en", ...LANGUAGES],
    disableLiveTranslations: true,
    // Each of these sends a child's work or words to somebody's service.
    githubEditor: false,
    immersiveReader: false,
    shareHomepageContent: false,
    qrCode: false,
    enabledFeatures: {},
    experiments: [],
  });
  bundle.cloud = {
    ...bundle.cloud,
    packages: false,
    sharing: false,
    publishing: false,
    importing: false,
    thumbnails: false,
    githubPackages: false,
    preferredPackages: [],
    cloudProviders: {},
  };
  // A simulator of a robot kit, served from its makers' own site.
  delete bundle.simulator.messageSimulators;
  // The colour themes paint with pictures from the editor's own site, a
  // texture of the board's logo among them.
  for (const colours of Object.values(bundle.colorThemeMap ?? {}))
    if (colours.overrideCss)
      colours.overrideCss = colours.overrideCss.replaceAll(
        /url\("\/static\/[^"]*"\)/g,
        "none",
      );
  for (const files of Object.values(bundle.bundledpkgs)) {
    const source = files["pxt.json"];
    if (!source) continue;
    const config = JSON.parse(source) as { icon?: unknown };
    // A package's picture is on the editor's own site too.
    if (config.icon !== undefined) {
      delete config.icon;
      files["pxt.json"] = JSON.stringify(config, null, 4);
    }
  }
  return (script ? BUNDLE_PREFIX : "") + JSON.stringify(bundle);
}

type Words = Record<string, string>;

/**
 * One file of the editor's words in a language, as translators have
 * approved them so far. The service answers a file it has nothing for with
 * an empty one. It publishes no limits, so it is asked a few files at a
 * time and waited on when it says to.
 */
async function translated(language: string, filename: string): Promise<Words> {
  const url = `${TRANSLATIONS}?${new URLSearchParams({
    lang: language,
    filename,
    approved: "true",
  })}`;
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) return (await response.json()) as Words;
    if (
      attempt === ATTEMPTS ||
      (response.status < 500 && response.status !== 429)
    )
      throw new Error(`${url} answered ${response.status}`);
    const wait = Number(response.headers.get("retry-after")) || attempt * 2;
    await Bun.sleep(wait * 1000);
  }
}

/** Runs a few at a time, in the order given. */
async function inTurn<T, R>(
  items: readonly T[],
  each: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let from = 0; from < items.length; from += CONCURRENCY)
    results.push(
      ...(await Promise.all(items.slice(from, from + CONCURRENCY).map(each))),
    );
  return results;
}

/**
 * The files of words the editor asks its own site for in a language: its
 * own, the target's, the simulator's, and the blocks of every package that
 * comes with it in one, the first translation of a block winning as in
 * the editor's own packaging (pxt/cli/crowdin.ts).
 */
async function wordsIn(language: string, bundle: Bundle) {
  const own = ["strings.json", "target-strings.json", "sim-strings.json"];
  const packages = bundle.bundleddirs.flatMap((folder) => {
    const name = folder.replace(/^.*\//, "");
    return [`${name}-strings.json`, `${name}-jsdoc-strings.json`];
  });
  const fetched = await inTurn([...own, ...packages], (file) =>
    translated(
      language,
      file === "strings.json" ? file : `${bundle.id}/${file}`,
    ),
  );
  const blocks: Words = {};
  for (const words of fetched.slice(own.length))
    for (const [key, value] of Object.entries(words)) blocks[key] ??= value;
  return new Map<string, Words>([
    ...own.map((file, index) => [file, fetched[index] ?? {}] as const),
    ["bundled-strings.json", blocks],
  ]);
}

if (existsSync(STAMP) && readFileSync(STAMP, "utf8").trim() === PINNED)
  process.exit(0);

await rm(OUT, { recursive: true, force: true });
const [core, target] = await Promise.all([
  unpack(CORE, [
    "package/LICENSE",
    "package/webapp/public/**",
    "package/built/web/*.js",
    "package/built/web/*.css",
    "package/built/web/fonts/*",
    "package/built/web/vs/**",
    "!**/*.map",
  ]),
  unpack(TARGET, [
    "package/LICENSE.txt",
    "package/targetconfig.json",
    "package/built/**",
    "package/sim/public/**",
    "!**/*.map",
  ]),
]);

const sources = new Map<string, string>();
for (const pack of [core, target])
  for (const file of pack.files) {
    if (file.startsWith("LICENSE")) continue;
    // Only the target's own built files of these kinds are the editor's.
    if (
      pack === target &&
      file.startsWith("built/") &&
      !file.startsWith("built/hexcache/") &&
      ![".js", ".css", ".json", ".webmanifest"].includes(extname(file))
    )
      continue;
    const name = servedAs(file);
    if (LEFT_OUT.some((left) => left.test(name))) continue;
    sources.set(name, join(pack.root, file));
  }

const shipped = JSON.parse(
  await readFile(join(target.root, "built/target.json"), "utf8"),
) as Bundle;
const offered = (key: string, name: string) =>
  shipped.appTheme[key] && sources.has(name) ? BASE + name : "";

const config = {
  relprefix: BASE,
  verprefix: "",
  workerjs: `${BASE}worker.js`,
  monacoworkerjs: `${BASE}monacoworker.js`,
  gifworkerjs: `${BASE}gifjs/gif.worker.js`,
  serviceworkerjs: `${BASE}serviceworker.js`,
  typeScriptWorkerJs: `${BASE}tsworker.js`,
  pxtVersion: shipped.versions.pxt,
  pxtRelId: "localDirRelId",
  pxtCdnUrl: BASE,
  commitCdnUrl: BASE,
  blobCdnUrl: BASE,
  cdnUrl: BASE,
  targetVersion: "0.0.0",
  targetRelId: "",
  targetUrl: "",
  targetId: shipped.id,
  simUrl: `${BASE}simulator.html`,
  simserviceworkerUrl: `${BASE}simulatorserviceworker.js`,
  simworkerconfigUrl: `${BASE}workerConfig.js`,
  partsUrl: `${BASE}siminstructions.html`,
  runUrl: `${BASE}run.html`,
  docsUrl: `${BASE}docs.html`,
  multiUrl: `${BASE}multi.html`,
  asseteditorUrl: `${BASE}asseteditor.html`,
  isStatic: true,
};

const REPLACED: [string, string][] = [
  ["/embed.js", `${BASE}embed.js`],
  ["/cdn/", BASE],
  ["/doccdn/", BASE],
  ["/sim/", BASE],
  ["/blb/", BASE],
  ["/trgblb/", BASE],
  ["@monacoworkerjs@", `${BASE}monacoworker.js`],
  ["@gifworkerjs@", `${BASE}gifjs/gif.worker.js`],
  ["@workerjs@", `${BASE}worker.js`],
  ["@serviceworkerjs@", `${BASE}serviceworker.js`],
  ["@timestamp@", ""],
  ["var pxtConfig = null", `var pxtConfig = ${JSON.stringify(config)}`],
  ["@defaultLocaleStrings@", ""],
  ["@cachedHexFiles@", ""],
  ["@cachedHexFilesEncoded@", ""],
  ["@targetEditorJs@", offered("extendEditor", "editor.js")],
  ["@targetFieldEditorsJs@", offered("extendFieldEditors", "fieldeditors.js")],
  ["@targetScriptPageJs@", offered("extendScriptPage", "scriptPage.js")],
  ["@targetImages@", ""],
  ["@targetImagesEncoded@", ""],
];

const served = async (name: string, path: string): Promise<Uint8Array> => {
  const bytes = await readFile(path);
  if (!TEXT.test(name)) return bytes;
  let text = bytes.toString("utf8");
  if (name === "target.json" || name === "target.js")
    return Buffer.from(ownTarget(text, name === "target.js"));
  if (name.startsWith("sim") || name.startsWith("workerConfig"))
    text = text.replace(/\/(cdn|sim)\//g, "/blb/");
  if (REWRITTEN.has(name))
    for (const [from, to] of REPLACED) text = text.replaceAll(from, to);
  return Buffer.from(text);
};

const sizes = await Promise.all(
  [...sources].map(async ([name, path]) => {
    const data = await served(name, path);
    await mkdir(dirname(join(SITE, name)), { recursive: true });
    await writeFile(join(SITE, name), data);
    return data.byteLength;
  }),
);
const bytes = sizes.reduce((total, size) => total + size, 0);

// What the editor's own page sets before its code loads: where its files
// are, and how its text editor finds its parts. The page around the frame
// is told which editor this is, so a project is handed over as one made in
// this version and none of the editor's repairs for older ones run on it.
const stock = await readFile(
  join(core.root, "webapp/public/index.html"),
  "utf8",
);
const monaco = /window\.MonacoPaths = (\{[\s\S]*?\n\s*\})/.exec(stock)?.[1];
if (!monaco)
  throw new Error("pxt-core: the page no longer names Monaco's files");
const paths = REPLACED.reduce(
  (text, [from, to]) => text.replaceAll(from, to),
  monaco,
);
await writeFile(
  join(SITE, "host-config.js"),
  [
    `var pxtConfig = ${JSON.stringify(config)};`,
    "window.MonacoEnvironment = { getWorkerUrl: function () { return pxt.webConfig.monacoworkerjs; } };",
    `window.MonacoPaths = ${paths};`,
    `parent.postMessage(${JSON.stringify({
      type: "farida-makecode",
      target: shipped.id,
      version: shipped.versions.target,
    })}, "*");`,
    "",
  ].join("\n"),
);
await writeFile(
  join(SITE, "index.html"),
  `<!doctype html>
<html lang="en" data-framework="typescript">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,height=device-height,user-scalable=no,initial-scale=1.0,maximum-scale=1.0,minimum-scale=1.0">
    <title>Code editor</title>
    <link rel="stylesheet" data-rtl="${BASE}rtlsemantic.css" href="${BASE}semantic.css" type="text/css">
</head>
<body class="main pxt-theme-root">
    <div id="pxt-aria-live" class="sr-only" aria-live="polite"></div>
    <div id="loading" class="ui active dimmer"><div class="ui large main loader"></div></div>
    <div id="custom-content"></div>
    <div id="blocks-editor-field-div"></div>
    <div id="allcontent"><div id="editorcontent"><div id="content" class="ui dimmable full-abs"></div></div></div>
    <div id="msg" aria-live="polite">
        <div id="errmsg" class="ui red inverted segment"></div>
        <div id="warnmsg" class="ui orange inverted segment"></div>
        <div id="infomsg" class="ui teal inverted segment"></div>
        <div id="compilemsg" class="ui ignored info message"></div>
    </div>
    <script src="${BASE}host-config.js"></script>
    <script src="${BASE}pxtapp.js"></script>
    <script src="${BASE}target.js"></script>
    <script id="mainscript" src="${BASE}main.js"></script>
    <xml id="blocklyToolboxDefinitionCategory" style="display: none"><category name=""></category></xml>
    <xml id="blocklyToolboxDefinitionFlyout" style="display: none"></xml>
</body>
</html>
`,
);

// Both are MIT, which asks that the notice travel with every copy. The
// names are their owners', and say only what this editor is and is for.
await writeFile(
  join(SITE, "LICENSE.txt"),
  [
    "This is a copy of the MakeCode editor for the micro:bit, served by a",
    "school as part of Farida LMS. Neither Microsoft nor the Micro:bit",
    "Educational Foundation runs, endorses or supports it. MAKECODE and",
    "MICROSOFT are trademarks of Microsoft Corporation; micro:bit is a",
    "trademark of the Micro:bit Educational Foundation.",
    "",
    `${CORE.name} ${CORE.version}`,
    "",
    await readFile(join(core.root, "LICENSE"), "utf8"),
    "",
    `${TARGET.name} ${TARGET.version}`,
    "",
    await readFile(join(target.root, "LICENSE.txt"), "utf8"),
  ].join("\n"),
);

for (const language of LANGUAGES) {
  const words = await wordsIn(language, shipped);
  if (Object.keys(words.get("strings.json") ?? {}).length === 0)
    throw new Error(`the editor has no words in "${language}"`);
  await mkdir(join(SITE, "locales", language), { recursive: true });
  await Promise.all(
    [...words].map(([file, content]) =>
      writeFile(join(SITE, "locales", language, file), JSON.stringify(content)),
    ),
  );
}

await rm(UNPACKED, { recursive: true, force: true });
await writeFile(STAMP, `${PINNED}\n`);
console.log(
  `micro:bit editor ${TARGET.version} in ${SITE}: ${sources.size} files, ${(bytes / 1e6).toFixed(1)} MB`,
);
