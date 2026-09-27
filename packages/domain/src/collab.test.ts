import { describe, expect, it } from "vitest";

import { roomOf, signTicket, verifyTicket } from "./collab";

const secret = new Uint8Array(32).fill(7);
const ticket = {
  tenantId: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b41",
  documentId: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b42",
  userId: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b43",
  access: "write" as const,
  expiresAt: Math.floor(Date.now() / 1000) + 60,
};

describe("collaboration tickets", () => {
  it("carry what the API signed, for one room", async () => {
    const token = await signTicket(ticket, secret);
    expect(await verifyTicket(token, secret)).toEqual(ticket);
    expect(roomOf(ticket)).toBe(`${ticket.tenantId}:${ticket.documentId}`);
  });

  it("refuse a changed body, another key and an expired ticket", async () => {
    const token = await signTicket(ticket, secret);
    const [body = "", signature = ""] = token.split(".");
    const upgraded = btoa(
      JSON.stringify({ ...ticket, access: "write", userId: ticket.tenantId }),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
    expect(await verifyTicket(`${upgraded}.${signature}`, secret)).toBeNull();
    expect(await verifyTicket(`${body}.${signature}x`, secret)).toBeNull();
    expect(await verifyTicket(token, new Uint8Array(32).fill(8))).toBeNull();
    expect(
      await verifyTicket(
        await signTicket({ ...ticket, expiresAt: 1 }, secret),
        secret,
      ),
    ).toBeNull();
    expect(await verifyTicket("not-a-ticket", secret)).toBeNull();
  });
});
