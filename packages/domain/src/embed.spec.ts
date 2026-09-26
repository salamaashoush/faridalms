import { describe, expect, it } from "vitest";

import { embedPage, embedSource, parseEmbedUrl } from "./embed";

describe("embeddable links", () => {
  it("recognises the providers teachers paste most", () => {
    expect(
      parseEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42"),
    ).toEqual({
      provider: "youtube",
      embedId: "dQw4w9WgXcQ",
    });
    expect(parseEmbedUrl("https://youtu.be/dQw4w9WgXcQ")?.provider).toBe(
      "youtube",
    );
    expect(
      parseEmbedUrl("https://youtube.com/shorts/dQw4w9WgXcQ")?.embedId,
    ).toBe("dQw4w9WgXcQ");
    expect(parseEmbedUrl("https://vimeo.com/76979871")).toEqual({
      provider: "vimeo",
      embedId: "76979871",
    });
    expect(
      parseEmbedUrl(
        "https://docs.google.com/presentation/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit#slide=id.p",
      ),
    ).toEqual({
      provider: "google-slides",
      embedId: "1AbCdEfGhIjKlMnOpQrStUvWxYz",
    });
    expect(
      parseEmbedUrl(
        "https://docs.google.com/forms/d/e/1FAIpQLSc_example_form_id/viewform",
      ),
    ).toEqual({
      provider: "google-forms",
      embedId: "1FAIpQLSc_example_form_id",
    });
    expect(
      parseEmbedUrl("https://www.canva.com/design/DAFabc1234/Xyz_key-123/view"),
    ).toEqual({ provider: "canva", embedId: "DAFabc1234/Xyz_key-123" });
    expect(
      parseEmbedUrl(
        "https://www.loom.com/share/0123456789abcdef0123456789abcdef",
      ),
    ).toEqual({
      provider: "loom",
      embedId: "0123456789abcdef0123456789abcdef",
    });
  });

  it("ignores links it cannot embed safely", () => {
    for (const link of [
      "javascript:alert(1)",
      "https://evil.example/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=<script>",
      "https://docs.google.com/spreadsheets/u/0/",
      "not a link",
    ])
      expect(parseEmbedUrl(link)).toBeNull();
  });

  it("builds privacy-preserving player addresses", () => {
    const embed = { provider: "youtube" as const, embedId: "dQw4w9WgXcQ" };
    expect(embedSource(embed)).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
    );
    expect(embedPage(embed)).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(embedSource({ provider: "vimeo", embedId: "76979871" })).toContain(
      "dnt=1",
    );
  });
});
