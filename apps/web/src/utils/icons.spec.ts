import { describe, expect, it } from "vitest";

import { iconsFor } from "./icons";

const page = (staticData: { schoolFace?: boolean }, loaderData?: unknown) => ({
  staticData,
  loaderData,
});

describe("iconsFor", () => {
  it("names the school's logo as the icon of a page in its face", () => {
    const icons = iconsFor([
      page({}),
      page({ schoolFace: true }, { face: { logoKey: "t/1/logo.png" } }),
    ]);
    expect(icons).toEqual([
      { rel: "icon", href: "/public-media/t/1/logo.png" },
      { rel: "apple-touch-icon", href: "/public-media/t/1/logo.png" },
    ]);
    expect(
      iconsFor([page({ schoolFace: true }, { logoKey: "t/1/logo.png" })]),
    ).toEqual(icons);
  });

  it("keeps the platform's icons without a face or a logo", () => {
    const platform = iconsFor([page({})]);
    expect(platform.some((link) => link.href === "/favicon.svg")).toBe(true);
    expect(iconsFor([page({ schoolFace: true }, { logoKey: null })])).toEqual(
      platform,
    );
    expect(iconsFor([page({}, { logoKey: "t/1/logo.png" })])).toEqual(platform);
  });
});
