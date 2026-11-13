import { THEME_IDS } from "@faridalms/domain/site-theme";
import { describe, expect, it } from "vitest";

import { THEME_GROUPS } from "./labels";

describe("the themes' groups", () => {
  it("hold every theme exactly once, two or three to a group", () => {
    expect(THEME_GROUPS.flatMap((group) => group.themes).toSorted()).toEqual(
      [...THEME_IDS].toSorted(),
    );
    expect(
      THEME_GROUPS.filter(
        (group) => group.themes.length < 2 || group.themes.length > 3,
      ),
    ).toEqual([]);
  });
});
