import { describe, expect, it } from "vitest";

import {
  isPacing,
  pacingRoom,
  roomOf,
  signSignal,
  signTicket,
  verifySignal,
  verifyTicket,
} from "./collab";

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
    expect(await verifyTicket(token, secret)).toEqual({
      ...ticket,
      room: "document",
    });
    expect(roomOf(ticket)).toBe(`${ticket.tenantId}:${ticket.documentId}`);
  });

  it("name a conversation's presence room apart from any document's", async () => {
    const presence = {
      ...ticket,
      access: "read" as const,
      room: "presence" as const,
    };
    const token = await signTicket(presence, secret);
    const read = await verifyTicket(token, secret);
    expect(read && !isPacing(read) ? read.room : null).toBe("presence");
    expect(read ? roomOf(read) : null).toBe(
      `${ticket.tenantId}:presence:${ticket.documentId}`,
    );
    expect(roomOf(presence)).not.toBe(roomOf(ticket));
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

  it("let a student listen for a lesson's pacing, in a room of its own", async () => {
    const pacing = {
      kind: "pacing" as const,
      tenantId: ticket.tenantId,
      lessonId: ticket.documentId,
      userId: ticket.userId,
      expiresAt: ticket.expiresAt,
    };
    const token = await signTicket(pacing, secret);
    expect(await verifyTicket(token, secret)).toEqual(pacing);
    expect(roomOf(pacing)).toBe(pacingRoom(ticket.tenantId, ticket.documentId));
    expect(roomOf(pacing)).not.toBe(roomOf(ticket));
  });
});

describe("signals to a room", () => {
  it("carry the room the API named, and are no ticket", async () => {
    const signal = {
      room: pacingRoom(ticket.tenantId, ticket.documentId),
      expiresAt: ticket.expiresAt,
    };
    const token = await signSignal(signal, secret);
    expect(await verifySignal(token, secret)).toEqual(signal);
    expect(await verifyTicket(token, secret)).toBeNull();
    expect(
      await verifySignal(await signTicket(ticket, secret), secret),
    ).toBeNull();
    expect(
      await verifySignal(
        await signSignal({ ...signal, expiresAt: 1 }, secret),
        secret,
      ),
    ).toBeNull();
  });
});
