import { join } from "node:path";

// The page a student's web page plays in, served by the files host on its
// own cookieless domain. It holds one frame sandboxed to an opaque origin
// and puts in it whatever page the lesson around it sends, so a student's
// page reaches no cookies, storage or classmate's page, and whatever it
// hangs, it hangs in another site's process.

const SHELL = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body,iframe{margin:0;border:0;width:100%;height:100%;display:block;background:#fff}</style>
</head>
<body>
<iframe sandbox="allow-scripts allow-modals allow-forms" title=""></iframe>
<script src="/play/shell.js"></script>
</body>
</html>
`;

// Relays a page from the lesson into the frame, and what the page writes
// to its console back out to the lesson. Each page gets a frame of its own:
// a frame given another page adds a step to the tab's history, and a
// reader pressing Back would walk through every redraw before leaving.
// Before the lesson is told the page is ready, a frame that fails on
// purpose finds out whether this browser hides a page's errors from it, as
// Safari does from a page with no origin; the lesson then has pages note
// their errors themselves.
const SCRIPT = `let frame = document.querySelector("iframe");
addEventListener("message", (event) => {
  if (event.source === parent && event.data && event.data.type === "show") {
    const next = document.createElement("iframe");
    next.setAttribute("sandbox", frame.getAttribute("sandbox"));
    next.title = String(event.data.title || "");
    next.srcdoc = String(event.data.html || "");
    frame.replaceWith(next);
    frame = next;
  } else if (event.source === frame.contentWindow) {
    parent.postMessage(event.data, "*");
  } else if (event.source === probe.contentWindow) {
    ready(Boolean(event.data && event.data.hidden));
  }
});
const probe = document.createElement("iframe");
probe.setAttribute("sandbox", frame.getAttribute("sandbox"));
probe.hidden = true;
probe.srcdoc = "<script>addEventListener('error', (event) => parent.postMessage({ hidden: event.message === 'Script error.' && !event.lineno }, '*')); throw new Error('probe')</" + "script>";
let told = false;
const ready = (hidden) => {
  if (told) return;
  told = true;
  probe.remove();
  parent.postMessage({ type: "ready", hidden }, "*");
};
setTimeout(() => ready(false), 1500);
document.body.append(probe);
`;

// The policy a student's page inherits from the frame it is put in: its own
// scripts and styles run, pictures come from itself or the files host, and
// nothing reaches the network, so a page cannot send a classmate's work or
// a child's typing anywhere. The files host is named as well as meant by
// 'self': Safari takes 'self' to match nothing for a page with no origin,
// which would keep a page from the libraries served beside it.
const policy = (origin: string | null) =>
  [
    "default-src 'none'",
    `script-src 'self'${origin ? ` ${origin}` : ""} 'unsafe-inline' 'unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");

const headers = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "no-cache",
};

/**
 * The play page and its script, or null for any other address. `origin` is
 * the files host as browsers reach it.
 */
export function playResponse(
  path: string,
  origin: string | null = null,
): Response | null {
  if (path === "/play")
    return new Response(SHELL, {
      headers: {
        ...headers,
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": policy(origin),
      },
    });
  if (path === "/play/shell.js")
    return new Response(SCRIPT, {
      headers: { ...headers, "content-type": "text/javascript; charset=utf-8" },
    });
  return null;
}

/** The libraries a played page may load, each the file install fetched, unchanged. */
const LIBRARIES: Record<string, { file: string; type: string }> = {
  "/play/lib/p5.min.js": {
    file: "p5/p5.min.js",
    type: "text/javascript; charset=utf-8",
  },
  "/play/lib/p5.LICENSE.txt": {
    file: "p5/LICENSE.txt",
    type: "text/plain; charset=utf-8",
  },
};

/**
 * A library a played page asks for, from the folder install fetched them
 * into, or null for any other address. Any page may read it: a played page
 * has no origin of its own to be allowed by name.
 */
export async function libraryResponse(
  path: string,
  vendor: string,
): Promise<Response | null> {
  const library = LIBRARIES[path];
  if (!library) return null;
  const file = Bun.file(join(vendor, library.file));
  if (!(await file.exists()))
    return new Response(null, { status: 404, headers });
  return new Response(file, {
    headers: {
      "x-content-type-options": "nosniff",
      "content-type": library.type,
      "access-control-allow-origin": "*",
      "cross-origin-resource-policy": "cross-origin",
      "cache-control": "public, max-age=86400",
    },
  });
}
