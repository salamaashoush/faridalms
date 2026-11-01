// The coding studio, served by the files host beside the play page: the
// Scratch editor and the small page of ours that lets the lesson around it
// keep the project. It runs whatever project it is handed, a classmate's
// included, which is why it lives here: on another site from the school's,
// with no cookies, where it can never run as the application. Its policy
// lets it reach nothing but this host, so nothing a child makes or types
// goes to Scratch's servers.
import { join, resolve, sep } from "node:path";

const PREFIX = "/studio/";
// The editor's bundle was built to sit at the root of its host, and asks
// there for the code it loads late and the pictures it shows, whatever
// address its page has.
const ROOTED = /^\/(?:chunks|static)\//;
const PAGE = new Set([
  "index.html",
  "host.js",
  "host.css",
  "logo.svg",
  "fullscreen.svg",
  "SOURCE.txt",
]);
const LIBRARY = /^library\/([0-9a-f]{32}\.[a-z0-9]+)$/;
/** The editor names its chunks and pictures by a hash of what they hold. */
const HASHED = /\.[0-9a-f]{16,}\./;

// The editor injects its styles, its project reader compiles JSON schemas
// with `new Function` (ajv), and face sensing compiles WebAssembly.
const POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const headers = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": POLICY,
};

const missing = () => new Response(null, { status: 404, headers });

/**
 * The studio's pages and files, or null for an address outside it. `dir` is
 * what `farida-studio` (the @faridalms/studio package) puts together: its
 * page, the Scratch editor and the editor's library.
 */
export function createStudio(options: { dir: string }) {
  const page = join(options.dir, "page");
  const editor = resolve(options.dir, "editor");

  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    const rooted = ROOTED.test(path);
    if (!rooted && !path.startsWith(PREFIX)) return null;
    let name: string;
    try {
      name =
        decodeURIComponent(path.slice(rooted ? 1 : PREFIX.length)) ||
        "index.html";
    } catch {
      return missing();
    }
    const library = LIBRARY.exec(name)?.[1];
    const target = PAGE.has(name)
      ? join(page, name)
      : library
        ? join(options.dir, "library", library)
        : resolve(editor, name);
    if (!PAGE.has(name) && !library && !target.startsWith(editor + sep))
      return missing();
    const file = Bun.file(target);
    if (!(await file.exists())) return missing();

    if (library || HASHED.test(name))
      return new Response(file, {
        headers: {
          ...headers,
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    // The editor's main bundle is 16 MB under a name that never changes, so
    // a browser asks whether its copy still stands instead of fetching it
    // again each time the studio opens.
    const etag = `"${file.size.toString(36)}-${file.lastModified.toString(36)}"`;
    const fresh = { ...headers, "cache-control": "no-cache", etag };
    return request.headers.get("if-none-match") === etag
      ? new Response(null, { status: 304, headers: fresh })
      : new Response(file, { headers: fresh });
  };
}
