/**
 * Resend as the end-to-end gate meets it: the API sends email here and reads
 * received email from here (RESEND_API_URL), and a spec looks at what was
 * sent and leaves mail to be received, at `/e2e/...`.
 */
export function startResendStandIn(port: number) {
  const sent: Record<string, unknown>[] = [];
  const received = new Map<string, Record<string, unknown>>();
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/emails") {
        const body = (await request.json()) as Record<string, unknown>;
        sent.push(body);
        return Response.json({ id: `e2e-${sent.length}` });
      }
      const reading = /^\/emails\/receiving\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && reading?.[1]) {
        const email = received.get(decodeURIComponent(reading[1]));
        return email
          ? Response.json(email)
          : Response.json({ name: "not_found" }, { status: 404 });
      }
      if (request.method === "GET" && url.pathname === "/e2e/sent") {
        const to = url.searchParams.get("to");
        return Response.json(
          sent.filter(
            (email) =>
              !to || (Array.isArray(email.to) && email.to.includes(to)),
          ),
        );
      }
      if (request.method === "POST" && url.pathname === "/e2e/received") {
        const email = (await request.json()) as Record<string, unknown>;
        received.set(String(email.id), email);
        return new Response(null, { status: 204 });
      }
      return Response.json({ name: "not_found" }, { status: 404 });
    },
  });
}
