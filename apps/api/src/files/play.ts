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
// to its console back out to the lesson.
const SCRIPT = `const frame = document.querySelector("iframe");
addEventListener("message", (event) => {
  if (event.source === parent && event.data && event.data.type === "show") {
    frame.title = String(event.data.title || "");
    frame.srcdoc = String(event.data.html || "");
  } else if (event.source === frame.contentWindow) {
    parent.postMessage(event.data, "*");
  }
});
parent.postMessage({ type: "ready" }, "*");
`;

// The policy a student's page inherits from the frame it is put in: its own
// scripts and styles run, pictures come from itself or the files host, and
// nothing reaches the network, so a page cannot send a classmate's work or
// a child's typing anywhere.
const POLICY = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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

/** The play page and its script, or null for any other address. */
export function playResponse(path: string): Response | null {
  if (path === "/play")
    return new Response(SHELL, {
      headers: {
        ...headers,
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": POLICY,
      },
    });
  if (path === "/play/shell.js")
    return new Response(SCRIPT, {
      headers: { ...headers, "content-type": "text/javascript; charset=utf-8" },
    });
  return null;
}
