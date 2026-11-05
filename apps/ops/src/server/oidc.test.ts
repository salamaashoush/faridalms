import { randomBytes } from "node:crypto";
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { opsEnv } from "./env";
import { operatorOf } from "./oidc";
import { seal, unseal } from "./seal";

beforeEach(() => {
  vi.stubEnv(
    "OPS_DIRECTORY_URL",
    "postgres://directory_admin@127.0.0.1/directory",
  );
  vi.stubEnv("OPS_ORIGIN", "https://ops.example.com");
  vi.stubEnv("OPS_OIDC_ISSUER", "https://id.example.com");
  vi.stubEnv("OPS_OIDC_CLIENT_ID", "farida-ops");
  vi.stubEnv("OPS_OIDC_GROUP", "farida-operators");
  vi.stubEnv("OPS_SESSION_SECRET", randomBytes(32).toString("base64"));
  vi.stubEnv("PROVISION_URL", "http://provisioner:3005");
  vi.stubEnv("PROVISION_SECRET", randomBytes(32).toString("base64"));
  vi.stubEnv("PORTAL_DOMAIN", "example.com");
  vi.stubEnv("SITES_DOMAIN", "example.net");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("operators", () => {
  it("lets in only members of the operators' group, under an opaque id", () => {
    const salama = operatorOf({
      iss: "https://id.example.com",
      sub: "google-oauth2|1234567890",
      name: "Salama Ashoush",
      groups: ["staff", "farida-operators"],
    });
    expect(salama).toMatchObject({ name: "Salama Ashoush" });
    if (salama === "not_operator") throw new Error("refused");
    expect(salama.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(salama.id).not.toContain("1234567890");
    expect(
      operatorOf({
        iss: "https://id.example.com",
        sub: "google-oauth2|1234567890",
        groups: ["farida-operators"],
      }),
    ).toMatchObject({ id: salama.id });
    expect(
      operatorOf({
        iss: "https://id.example.com",
        sub: "someone",
        groups: ["teachers"],
      }),
    ).toBe("not_operator");
    expect(operatorOf({ iss: "https://id.example.com", sub: "someone" })).toBe(
      "not_operator",
    );
  });
});

describe("operators by verified email", () => {
  beforeEach(() => {
    // Empty is unset, as compose passes an unset variable.
    vi.stubEnv("OPS_OIDC_GROUP", "");
    vi.stubEnv("OPS_OIDC_EMAILS", " Salama@Example.com , ops@example.com,");
  });
  const google = {
    iss: "https://accounts.google.com",
    sub: "109876543210987654321",
  };

  it("lets in a listed address the provider verified, compared without case", () => {
    expect(
      operatorOf({
        ...google,
        email: "salama@example.COM",
        email_verified: true,
      }),
    ).toMatchObject({ name: "salama@example.COM" });
    expect(
      operatorOf({ ...google, email: "ops@example.com", email_verified: true }),
    ).not.toBe("not_operator");
  });

  it("keeps the verified address and when the provider signed them in", () => {
    expect(
      operatorOf(
        {
          ...google,
          email: "Salama@Example.com",
          email_verified: true,
          auth_time: 1_800_000_000,
        },
        1_800_000_100,
      ),
    ).toMatchObject({ email: "salama@example.com", authAt: 1_800_000_000 });
    expect(
      operatorOf(
        { ...google, email: "salama@example.com", email_verified: true },
        1_800_000_100,
      ),
    ).toMatchObject({ authAt: 1_800_000_100 });
  });

  it("refuses an address that is not listed", () => {
    expect(
      operatorOf({
        ...google,
        email: "someone@example.com",
        email_verified: true,
      }),
    ).toBe("not_operator");
  });

  it("refuses a listed address the provider did not verify", () => {
    for (const email_verified of [false, "true", undefined])
      expect(
        operatorOf({ ...google, email: "salama@example.com", email_verified }),
      ).toBe("not_operator");
  });

  it("ignores groups when the rule is the list", () => {
    expect(
      operatorOf({
        ...google,
        email: "someone@example.com",
        email_verified: true,
        groups: ["farida-operators"],
      }),
    ).toBe("not_operator");
  });
});

describe("the sign-in rule", () => {
  it("is a group or a list of addresses, exactly one of them", () => {
    expect(opsEnv().OPS_OIDC_GROUP).toBe("farida-operators");
    vi.stubEnv("OPS_OIDC_EMAILS", "salama@example.com");
    expect(() => opsEnv()).toThrow(/not both/);
    vi.stubEnv("OPS_OIDC_GROUP", "");
    expect(opsEnv().OPS_OIDC_EMAILS).toEqual(["salama@example.com"]);
    vi.stubEnv("OPS_OIDC_EMAILS", "");
    expect(() => opsEnv()).toThrow(/OPS_OIDC_GROUP or OPS_OIDC_EMAILS/);
    vi.stubEnv("OPS_OIDC_EMAILS", "not an address");
    expect(() => opsEnv()).toThrow(/Invalid email/);
  });
});

describe("sealed cookies", () => {
  const schema = v.object({ id: v.string() });

  it("open only for their purpose, unchanged and before they expire", () => {
    const later = Math.floor(Date.now() / 1000) + 60;
    const token = seal("session", { id: "salama" }, later);
    expect(unseal("session", token, schema)).toEqual({ id: "salama" });
    expect(unseal("login", token, schema)).toBeNull();
    expect(
      unseal("session", seal("session", { id: "salama" }, 1), schema),
    ).toBeNull();
    const bytes = Buffer.from(token, "base64url");
    bytes[14] = (bytes[14] ?? 0) ^ 1;
    expect(unseal("session", bytes.toString("base64url"), schema)).toBeNull();
    expect(unseal("session", undefined, schema)).toBeNull();
  });
});
