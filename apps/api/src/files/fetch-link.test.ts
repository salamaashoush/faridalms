import { describe, expect, it } from "vitest";

import {
  fetchLink,
  isPrivateAddress,
  linkedName,
  publicTarget,
} from "./fetch-link";

const publicOnly = () => Promise.resolve(["93.184.215.14"]);

describe("addresses a link may not reach", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:169.254.169.254",
    "64:ff9b::a9fe:a9fe",
    "2002:a9fe:a9fe::1",
    "fd00:ec2::254",
    "fe80::1",
    "ff02::1",
    "2001::1",
    "not an address",
  ])("refuses %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "172.32.0.1", "93.184.215.14", "2606:4700::6810:84e5"])(
    "allows %s",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );

  it("refuses a host that resolves to a private address, even among public ones", async () => {
    await expect(
      publicTarget(new URL("https://pictures.example.com/a.png"), () =>
        Promise.resolve(["93.184.215.14", "10.0.0.5"]),
      ),
    ).rejects.toThrow("media.link_address");
  });

  it("refuses credentials, other schemes and ports", async () => {
    for (const link of [
      "https://user:secret@example.com/a.png",
      "ftp://example.com/a.png",
      "https://example.com:8443/a.png",
      "http://localhost/a.png",
    ])
      await expect(
        publicTarget(
          new URL(link),
          link.includes("localhost")
            ? () => Promise.resolve(["::1"])
            : publicOnly,
        ),
      ).rejects.toThrow("media.link_address");
  });

  it("answers the address it checked, to connect to", async () => {
    await expect(
      publicTarget(new URL("https://example.com/a.png"), () =>
        Promise.resolve(["93.184.215.14"]),
      ),
    ).resolves.toBe("93.184.215.14");
  });
});

describe("the name a fetched file is kept under", () => {
  it("keeps the link's own name when it says what it is", () => {
    expect(
      linkedName(
        new URL("https://example.com/photos/Sports%20day.jpg"),
        null,
        "image/jpeg",
      ),
    ).toBe("Sports day.jpg");
  });

  it("names it by its type when the link does not", () => {
    expect(
      linkedName(new URL("https://cdn.example.com/i/8f3a"), null, "image/png"),
    ).toBe("8f3a.png");
  });

  it("takes the server's name over the link's", () => {
    expect(
      linkedName(
        new URL("https://example.com/download?id=4"),
        'attachment; filename="timetable.pdf"',
        "application/pdf",
      ),
    ).toBe("timetable.pdf");
  });

  it("has no name for a type the school cannot keep", () => {
    expect(
      linkedName(
        new URL("https://example.com/run"),
        null,
        "application/x-msdownload",
      ),
    ).toBeNull();
  });
});

describe("fetching a link", () => {
  it("never asks a public name that points back at the server", async () => {
    await expect(
      fetchLink(
        "http://example.com/a.png",
        { maxBytes: 1024, timeoutMs: 1000 },
        () => Promise.resolve(["127.0.0.1"]),
      ),
    ).rejects.toThrow("media.link_address");
  });
});
