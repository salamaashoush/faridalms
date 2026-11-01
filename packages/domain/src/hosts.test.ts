import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { DnsFindings, ExpectedRecords, HostStatus } from "./hosts";

import {
  afterCheck,
  afterProbe,
  compareRecords,
  customHostnameSchema,
  customHostProblem,
  expectedRecords,
  hostOf,
  placeOf,
} from "./hosts";

const domains = { portal: "faridalms.com", sites: "faridalms.site" };
const local = { portal: "localhost", sites: "site.localhost" };

describe("hostOf", () => {
  it("drops the port, the case and a trailing dot", () => {
    expect(hostOf("Northwind.FaridaLMS.com:443")).toBe(
      "northwind.faridalms.com",
    );
    expect(hostOf("www.example.com.")).toBe("www.example.com");
    expect(hostOf("127.0.0.1:3200")).toBe("127.0.0.1");
    expect(hostOf("[::1]:3000")).toBe("[::1]");
    expect(hostOf("localhost:3000")).toBe("localhost");
  });

  it("refuses what is not a name", () => {
    expect(hostOf("")).toBeNull();
    expect(hostOf(undefined)).toBeNull();
    expect(hostOf("exa mple.com")).toBeNull();
    expect(hostOf("-bad.example.com")).toBeNull();
    expect(hostOf("a..b.com")).toBeNull();
  });
});

describe("placeOf", () => {
  it("reads a school's platform names", () => {
    expect(placeOf("northwind.faridalms.com", domains)).toEqual({
      kind: "platform",
      role: "portal",
      slug: "northwind",
    });
    expect(placeOf("northwind.faridalms.site", domains)).toEqual({
      kind: "platform",
      role: "site",
      slug: "northwind",
    });
  });

  it("tells the development sites domain from the portal domain it sits under", () => {
    expect(placeOf("northwind.site.localhost", local)).toEqual({
      kind: "platform",
      role: "site",
      slug: "northwind",
    });
    expect(placeOf("northwind.localhost", local)).toEqual({
      kind: "platform",
      role: "portal",
      slug: "northwind",
    });
    expect(placeOf("site.localhost", local)).toEqual({ kind: "none" });
    expect(placeOf("a.b.localhost", local)).toEqual({ kind: "none" });
  });

  it("keeps the platform's own labels from naming a school", () => {
    for (const label of ["www", "api", "connect", "ops", "admin"])
      expect(placeOf(`${label}.faridalms.com`, domains)).toEqual({
        kind: "none",
      });
  });

  it("asks for the school on the bare portal domain and on an address", () => {
    expect(placeOf("faridalms.com", domains)).toEqual({ kind: "bare" });
    expect(placeOf("127.0.0.1", domains)).toEqual({ kind: "bare" });
    expect(placeOf("localhost", local)).toEqual({ kind: "bare" });
    expect(placeOf("faridalms.site", domains)).toEqual({ kind: "none" });
  });

  it("leaves any other name to the directory", () => {
    expect(placeOf("portal.acme.example.com", domains)).toEqual({
      kind: "custom",
      hostname: "portal.acme.example.com",
    });
  });
});

describe("custom hostnames", () => {
  it("normalises what a person types", () => {
    expect(v.parse(customHostnameSchema, "  WWW.Acme.Example.com. ")).toBe(
      "www.acme.example.com",
    );
    expect(v.safeParse(customHostnameSchema, "not a host").success).toBe(false);
  });

  it("refuses names under the platform's domains", () => {
    expect(customHostProblem("www.acme.example.com", domains)).toBeNull();
    expect(customHostProblem("acme.faridalms.com", domains)).toBe(
      "hosts.platform",
    );
    expect(customHostProblem("faridalms.site", domains)).toBe("hosts.platform");
    expect(customHostProblem("_farida-challenge.acme.com", domains)).toBe(
      "hosts.invalid",
    );
    expect(customHostProblem("localhost", domains)).toBe("hosts.invalid");
  });
});

const expected: ExpectedRecords = expectedRecords(
  { hostname: "www.acme.example.com", role: "site", challenge: "c".repeat(32) },
  "acme",
  domains,
  "203.0.113.10",
);

const found = (records: Partial<DnsFindings>): DnsFindings => ({
  txt: [],
  cname: [],
  a: [],
  ...records,
});

describe("compareRecords", () => {
  it("names the records a school publishes", () => {
    expect(expected).toEqual({
      txt: {
        name: "_farida-challenge.www.acme.example.com",
        value: "c".repeat(32),
      },
      cname: { name: "www.acme.example.com", target: "acme.faridalms.site" },
      a: { name: "www.acme.example.com", address: "203.0.113.10" },
    });
  });

  it("accepts the challenge with a CNAME or with A records to the platform", () => {
    expect(
      compareRecords(
        expected,
        found({ txt: ["c".repeat(32)], cname: ["Acme.FaridaLMS.site."] }),
      ),
    ).toEqual({ kind: "found" });
    expect(
      compareRecords(
        expected,
        found({ txt: ["c".repeat(32)], a: ["203.0.113.10"] }),
      ),
    ).toEqual({ kind: "found" });
  });

  it("refuses an apex that also points somewhere else", () => {
    expect(
      compareRecords(
        expected,
        found({ txt: ["c".repeat(32)], a: ["203.0.113.10", "198.51.100.7"] }),
      ),
    ).toEqual({ kind: "missing", problem: "hosts.route_missing" });
  });

  it("says which record is missing", () => {
    expect(
      compareRecords(expected, found({ cname: ["acme.faridalms.site"] })),
    ).toEqual({ kind: "missing", problem: "hosts.txt_missing" });
    expect(compareRecords(expected, found({ txt: ["c".repeat(32)] }))).toEqual({
      kind: "missing",
      problem: "hosts.route_missing",
    });
  });

  it("proves nothing when a lookup failed", () => {
    expect(
      compareRecords(
        expected,
        found({ txt: null, cname: ["acme.faridalms.site"] }),
      ),
    ).toEqual({
      kind: "unknown",
      problem: "hosts.lookup_failed",
    });
    expect(
      compareRecords(expected, found({ txt: ["c".repeat(32)], a: null })),
    ).toEqual({ kind: "unknown", problem: "hosts.lookup_failed" });
  });

  it("cannot route an apex where the deployment has no address", () => {
    const noAddress = { ...expected, a: { ...expected.a, address: null } };
    expect(
      compareRecords(
        noAddress,
        found({ txt: ["c".repeat(32)], a: ["203.0.113.10"] }),
      ),
    ).toEqual({ kind: "missing", problem: "hosts.route_missing" });
  });
});

const day = 86_400_000;
const start = new Date("2026-11-01T08:00:00Z");
const at = (ms: number) => new Date(start.getTime() + ms);
const status = (patch: Partial<HostStatus> = {}): HostStatus => ({
  state: "pending",
  failures: 0,
  stateChangedAt: start,
  verifiedAt: null,
  lastError: null,
  ...patch,
});
const missing = {
  kind: "missing",
  problem: "hosts.txt_missing",
} as const;
const unknown = { kind: "unknown", problem: "hosts.lookup_failed" } as const;

describe("afterCheck", () => {
  it("verifies a pending host once its records are found", () => {
    const next = afterCheck(status(), { kind: "found" }, at(1000));
    expect(next).toEqual({
      state: "verified",
      failures: 0,
      stateChangedAt: at(1000),
      verifiedAt: at(1000),
      lastError: null,
    });
  });

  it("keeps a pending host pending, however often it is missing", () => {
    let next = status();
    for (let check = 0; check < 5; check += 1)
      next = afterCheck(next, missing, at(check * 3_600_000));
    expect(next).toMatchObject({
      state: "pending",
      failures: 0,
      lastError: "hosts.txt_missing",
    });
  });

  it("fails an active host on the third recheck in a row that misses", () => {
    let next = status({ state: "active", verifiedAt: start });
    next = afterCheck(next, missing, at(1));
    next = afterCheck(next, missing, at(2));
    expect(next).toMatchObject({ state: "active", failures: 2 });
    next = afterCheck(next, missing, at(3));
    expect(next).toMatchObject({
      state: "failing",
      failures: 3,
      stateChangedAt: at(3),
    });
  });

  it("forgives misses once the records are back", () => {
    let next = status({ state: "active", verifiedAt: start });
    next = afterCheck(next, missing, at(1));
    next = afterCheck(next, missing, at(2));
    next = afterCheck(next, { kind: "found" }, at(3));
    expect(next).toMatchObject({ state: "active", failures: 0 });
  });

  it("does not count a lookup that failed", () => {
    const next = afterCheck(
      status({ state: "active", failures: 2 }),
      unknown,
      at(1),
    );
    expect(next).toMatchObject({
      state: "active",
      failures: 2,
      lastError: "hosts.lookup_failed",
    });
  });

  it("verifies a failing host again when its records come back", () => {
    const next = afterCheck(
      status({ state: "failing", failures: 4, verifiedAt: start }),
      { kind: "found" },
      at(day),
    );
    expect(next).toMatchObject({
      state: "verified",
      failures: 0,
      verifiedAt: at(day),
      stateChangedAt: at(day),
    });
  });

  it("removes a host failing for seven days", () => {
    const failing = status({ state: "failing", failures: 3 });
    expect(afterCheck(failing, missing, at(7 * day - 1)).state).toBe("failing");
    expect(afterCheck(failing, missing, at(7 * day))).toMatchObject({
      state: "removed",
      stateChangedAt: at(7 * day),
    });
    expect(afterCheck(failing, unknown, at(8 * day)).state).toBe("removed");
  });

  it("leaves a removed host alone", () => {
    const removed = status({ state: "removed" });
    expect(afterCheck(removed, { kind: "found" }, at(1))).toBe(removed);
  });
});

describe("afterProbe", () => {
  it("activates a verified host once it answered over TLS", () => {
    const verified = status({ state: "verified", verifiedAt: start });
    expect(afterProbe(verified, true, at(5))).toMatchObject({
      state: "active",
      stateChangedAt: at(5),
      lastError: null,
    });
    expect(afterProbe(verified, false, at(5))).toMatchObject({
      state: "verified",
      lastError: "hosts.tls_pending",
    });
  });

  it("changes nothing for a host that is not verified", () => {
    const pending = status();
    expect(afterProbe(pending, true, at(1))).toBe(pending);
  });
});
