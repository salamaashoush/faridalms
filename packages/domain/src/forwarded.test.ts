import { describe, expect, it } from "vitest";

import { clientAddress } from "./forwarded";

describe("clientAddress", () => {
  it("takes the address the proxy added, not what the client claimed", () => {
    expect(clientAddress("10.9.8.7, 203.0.113.5", 1)).toBe("203.0.113.5");
  });

  it("counts trusted hops from the right", () => {
    expect(clientAddress("10.9.8.7, 203.0.113.5, 172.16.0.2", 2)).toBe(
      "203.0.113.5",
    );
  });

  it("trusts nothing when the request skipped a proxy", () => {
    expect(clientAddress("203.0.113.5", 2)).toBeNull();
    expect(clientAddress(undefined, 1)).toBeNull();
    expect(clientAddress(" , ", 1)).toBeNull();
  });
});
