import { describe, expect, it } from "vitest";

import {
  automatedReason,
  mailboxAddress,
  newContent,
  readReplyAddress,
  REPLY_MARKER,
  replyAddress,
  senderAuthenticated,
  textOfHtml,
} from "./email-replies";

const TENANT = "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3d01";
const TOKEN = "abcdefghijklmnopqrstuvwxyz";

describe("reply addresses", () => {
  it("carries the tenant and the token, and reads back from any case", () => {
    const address = replyAddress(TENANT, TOKEN, "reply.example.com");
    expect(address).toBe(
      "r+0192f0a47a1c7b5a9a2e2e6f1f2a3d01.abcdefghijklmnopqrstuvwxyz@reply.example.com",
    );
    expect(address.split("@")[0]?.length).toBeLessThanOrEqual(64);
    expect(
      readReplyAddress(address.toUpperCase(), "reply.example.com"),
    ).toEqual({ tenantId: TENANT, token: TOKEN });
  });

  it("refuses another domain, a short token and a stray part", () => {
    const address = replyAddress(TENANT, TOKEN, "reply.example.com");
    expect(readReplyAddress(address, "example.com")).toBeNull();
    expect(
      readReplyAddress(address.replace(TOKEN, "abc"), "reply.example.com"),
    ).toBeNull();
    expect(
      readReplyAddress(address.replace("@", ".extra@"), "reply.example.com"),
    ).toBeNull();
    expect(
      readReplyAddress("office@reply.example.com", "reply.example.com"),
    ).toBeNull();
  });

  it("finds the address in a display form", () => {
    expect(mailboxAddress('"Salama Ashoush" <Salama@Example.com>')).toBe(
      "salama@example.com",
    );
    expect(mailboxAddress("salama@example.com")).toBe("salama@example.com");
    expect(mailboxAddress("not an address")).toBeNull();
  });
});

describe("machines", () => {
  it("knows an out-of-office, a list, a bounce and a daemon", () => {
    expect(automatedReason({ "auto-submitted": "auto-replied" }, "a@b.c")).toBe(
      "auto_submitted",
    );
    expect(automatedReason({ "auto-submitted": "no" }, "a@b.c")).toBeNull();
    expect(automatedReason({ precedence: "bulk" }, "a@b.c")).toBe("precedence");
    expect(automatedReason({ "x-autoreply": "yes" }, "a@b.c")).toBe(
      "auto_reply",
    );
    expect(
      automatedReason({ "x-auto-response-suppress": "All" }, "a@b.c"),
    ).toBe("auto_reply");
    expect(automatedReason({ "list-id": "<x.y>" }, "a@b.c")).toBe("list");
    expect(automatedReason({ "return-path": "<>" }, "a@b.c")).toBe("bounce");
    expect(automatedReason({}, "MAILER-DAEMON@example.com")).toBe(
      "automated_sender",
    );
    expect(automatedReason({}, "no-reply@example.com")).toBe(
      "automated_sender",
    );
    expect(automatedReason({}, "salama@example.com")).toBeNull();
  });
});

describe("the new words in a reply", () => {
  it("stops at the marker the school's email starts with", () => {
    const text = `Tuesday at ten suits us.\n\n> ${REPLY_MARKER.en}\n> Dear Salama,`;
    expect(newContent(text)).toBe("Tuesday at ten suits us.");
  });

  it("drops Gmail's and Outlook's quoted message", () => {
    expect(
      newContent(
        "Yes please.\n\nOn Mon, 2 Nov 2026 at 09:00, Northwind <r+x@reply.example.com> wrote:\n> Dear Salama",
      ),
    ).toBe("Yes please.");
    expect(
      newContent(
        "Yes please.\n\nOn Mon, 2 Nov 2026 at 09:00, Northwind School\n<r+x@reply.example.com> wrote:\n> Dear",
      ),
    ).toBe("Yes please.");
    expect(
      newContent(
        "Thank you.\r\n\r\nFrom: Northwind School <r+x@reply.example.com>\r\nSent: Monday\r\nTo: Salama\r\n",
      ),
    ).toBe("Thank you.");
  });

  it("drops an Arabic quote header, a signature and a phone's line", () => {
    expect(
      newContent(
        "شكرًا لكم.\n\nفي الاثنين، ٢ نوفمبر ٢٠٢٦، كتب Northwind School:\n> مرحبًا",
      ),
    ).toBe("شكرًا لكم.");
    expect(newContent("See you then.\n-- \nSalama Ashoush\nAcme")).toBe(
      "See you then.",
    );
    expect(newContent("See you then.\n\nSent from my iPhone")).toBe(
      "See you then.",
    );
  });

  it("keeps everything when the reply was written below the quote", () => {
    expect(newContent("> Dear Salama,\n> When can you visit?")).toBe(
      "> Dear Salama,\n> When can you visit?",
    );
  });
});

describe("HTML-only mail", () => {
  it("keeps the text above the quoted message", () => {
    expect(
      textOfHtml(
        '<div dir="rtl">نعم&nbsp;شكرًا<br>سلامة</div><div class="gmail_quote">On … wrote:<blockquote>old</blockquote></div>',
      ),
    ).toBe("نعم شكرًا\nسلامة");
  });
});

describe("sender checks", () => {
  it("trusts DMARC first, then DKIM or SPF where there is no policy", () => {
    expect(senderAuthenticated({ dmarc: "pass" })).toBe(true);
    expect(
      senderAuthenticated({ dmarc: "fail", dkim: "pass", spf: "pass" }),
    ).toBe(false);
    expect(senderAuthenticated({ dmarc: "none", dkim: "pass" })).toBe(true);
    expect(senderAuthenticated({ dmarc: "none", spf: "fail" })).toBe(false);
    expect(senderAuthenticated(null)).toBe(false);
  });
});
