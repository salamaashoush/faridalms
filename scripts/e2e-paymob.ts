/**
 * Paymob as the end-to-end gate meets it: the console takes a token and
 * makes payment links here (PAYMOB_BASE_URL), and a spec reads the links
 * it made at `/e2e/links` to pay one by sending the console Paymob's
 * callback.
 */
export function startPaymobStandIn(port: number) {
  const links: {
    id: number;
    order: number;
    amountCents: number;
    reference: string;
    notificationUrl: string;
  }[] = [];
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/api/auth/tokens")
        return Response.json({ token: "e2e-token" });
      if (
        request.method === "POST" &&
        url.pathname === "/api/ecommerce/payment-links"
      ) {
        if (request.headers.get("authorization") !== "Bearer e2e-token")
          return Response.json({ detail: "unauthorized" }, { status: 401 });
        const form = await request.formData();
        const text = (key: string) => {
          const value = form.get(key);
          return typeof value === "string" ? value : "";
        };
        const link = {
          id: 47_000 + links.length,
          order: 193_000 + links.length,
          amountCents: Number(text("amount_cents")),
          reference: text("reference_id"),
          notificationUrl: text("notification_url"),
        };
        links.push(link);
        return Response.json(
          {
            id: link.id,
            reference_id: link.reference,
            amount_cents: link.amountCents,
            state: "created",
            client_url: `http://127.0.0.1:${port}/pay/${link.id}`,
            order: link.order,
          },
          { status: 201 },
        );
      }
      if (request.method === "GET" && url.pathname === "/e2e/links")
        return Response.json(links);
      return Response.json({ detail: "not found" }, { status: 404 });
    },
  });
}
