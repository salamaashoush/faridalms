import { describe, expect, it } from "vitest";

import { presentVariables } from "./environment";

describe("presentVariables", () => {
  it("drops variables compose passed empty and keeps everything else as given", () => {
    expect(
      presentVariables({
        MEDIA_ORIGIN: "",
        DIRECTORY_SYNC_URL: undefined,
        CELL_ID: "eg-1",
        PADDED: " ",
      }),
    ).toEqual({ CELL_ID: "eg-1", PADDED: " " });
  });
});
