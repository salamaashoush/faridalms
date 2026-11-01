import { describe, expect, it } from "vitest";

import { bucketEndpoint } from "./store";

describe("bucketEndpoint", () => {
  it("puts the bucket in the host only in the virtual-hosted style", () => {
    const endpoint = "https://hel1.your-objectstorage.com";
    expect(bucketEndpoint(endpoint, "faridalms-files", "virtual")).toBe(
      "https://faridalms-files.hel1.your-objectstorage.com",
    );
    expect(bucketEndpoint(endpoint, "faridalms-files", "path")).toBe(endpoint);
    expect(
      bucketEndpoint("http://minio:9000/", "faridalms-media", "virtual"),
    ).toBe("http://faridalms-media.minio:9000");
  });

  it("leaves the endpoint to the client where there is none", () => {
    expect(bucketEndpoint(undefined, "faridalms-files", "virtual")).toBe(
      undefined,
    );
  });
});
