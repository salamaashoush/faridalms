// The micro:bit editor, served by the files host beside the coding studio:
// MakeCode as apps/api/scripts/makecode.ts lays it out, with a page of ours
// in place of its own. It runs whatever project it is handed, a classmate's
// included, and its simulator runs that program in the browser, which is
// why it lives here: on another site from the school's, with no cookies,
// where it can never run as the application. Its policy lets it reach
// nothing but this host, so nothing a child makes goes to the editor's
// makers, and the lesson around it keeps every project.
import { resolve, sep } from "node:path";

const PREFIX = "/makecode/";

// The simulator runs a compiled program with `eval` and plays sound from
// code it builds on the spot; the editors inject their styles and draw
// their icons from data.
const POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "font-src 'self' data:",
  "worker-src 'self' blob: data:",
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

/** The editor's page and files, or null for an address outside it. */
export function createMakeCode(options: {
  /** The editor, as apps/api/scripts/makecode.ts fetches and lays it out. */
  editor: string;
}) {
  const root = resolve(options.editor);
  return async (request: Request): Promise<Response | null> => {
    const path = new URL(request.url).pathname;
    if (!path.startsWith(PREFIX)) return null;
    let name: string;
    try {
      name = decodeURIComponent(path.slice(PREFIX.length)) || "index.html";
    } catch {
      return missing();
    }
    const target = resolve(root, name);
    if (!target.startsWith(root + sep)) return missing();
    const file = Bun.file(target);
    if (!(await file.exists())) return missing();
    // The editor's files keep their names from one version to the next, so
    // a browser asks whether its copy still stands instead of fetching
    // megabytes again each time the editor opens.
    const etag = `"${file.size.toString(36)}-${file.lastModified.toString(36)}"`;
    const fresh = { ...headers, "cache-control": "no-cache", etag };
    return request.headers.get("if-none-match") === etag
      ? new Response(null, { status: 304, headers: fresh })
      : new Response(file, { headers: fresh });
  };
}
