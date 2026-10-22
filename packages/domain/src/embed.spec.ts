import { describe, expect, it } from "vitest";

import {
  embedAspect,
  embedPage,
  embedSource,
  isEmbedCode,
  parseEmbedInput,
  parseEmbedUrl,
} from "./embed";

describe("embeddable links", () => {
  it("recognises the simulations and graphs maths and science lessons use", () => {
    expect(parseEmbedUrl("https://www.geogebra.org/m/RHYH3UQ8")).toEqual({
      provider: "geogebra",
      embedId: "RHYH3UQ8",
    });
    expect(
      parseEmbedInput(
        '<iframe src="https://www.geogebra.org/material/iframe/id/cnZ8Q7ff/width/800/height/600" width="800"></iframe>',
      ),
    ).toEqual({ provider: "geogebra", embedId: "cnZ8Q7ff" });
    const graph = parseEmbedUrl("https://www.desmos.com/calculator/zukjgk9iry");
    expect(graph).toEqual({
      provider: "desmos",
      embedId: "calculator/zukjgk9iry",
    });
    expect(graph && embedSource(graph)).toBe(
      "https://www.desmos.com/calculator/zukjgk9iry?embed",
    );
    expect(parseEmbedUrl("https://www.desmos.com/scientific")).toBeNull();
    for (const address of [
      "https://phet.colorado.edu/en/simulations/projectile-motion",
      "https://phet.colorado.edu/sims/html/projectile-motion/latest/projectile-motion_ar.html",
    ])
      expect(parseEmbedUrl(address)).toEqual({
        provider: "phet",
        embedId: "projectile-motion",
      });
    expect(
      embedSource({ provider: "phet", embedId: "projectile-motion" }),
    ).toBe(
      "https://phet.colorado.edu/sims/html/projectile-motion/latest/projectile-motion_all.html",
    );
  });

  it("frames a school's Microsoft 365 files from its own tenant, rebuilt from their ids", () => {
    const word = parseEmbedInput(
      '<iframe src="https://contoso.sharepoint.com/sites/Science/_layouts/15/Doc.aspx?sourcedoc={A1B2C3D4-1111-2222-3333-444455556666}&amp;action=embedview" width="476px" height="288px" frameborder="0">This is an embedded <a target="_blank" href="https://office.com">Microsoft Office</a> document.</iframe>',
    );
    expect(word).toEqual({
      provider: "microsoft-365",
      embedId:
        "doc:contoso.sharepoint.com/sites/Science:a1b2c3d4-1111-2222-3333-444455556666",
    });
    expect(word && embedSource(word)).toBe(
      "https://contoso.sharepoint.com/sites/Science/_layouts/15/Doc.aspx?sourcedoc=%7Ba1b2c3d4-1111-2222-3333-444455556666%7D&action=embedview",
    );
    const slides = parseEmbedUrl(
      "https://contoso-my.sharepoint.com/personal/salma_contoso_com/_layouts/15/Doc.aspx?sourcedoc={a1b2c3d4-1111-2222-3333-444455556666}&action=embedview&wdAr=1.7777777777777777",
    );
    expect(slides?.embedId).toBe(
      "slides:contoso-my.sharepoint.com/personal/salma_contoso_com:a1b2c3d4-1111-2222-3333-444455556666",
    );
    expect(slides && embedAspect(slides)).toBe("16 / 9");
    const personal = parseEmbedUrl(
      "https://onedrive.live.com/embed?resid=ABCDEF1234567890%21123&authkey=%21AbCdEfGh12&em=2",
    );
    expect(personal).toEqual({
      provider: "microsoft-365",
      embedId: "live:ABCDEF1234567890!123:!AbCdEfGh12",
    });
    expect(personal && embedSource(personal)).toBe(
      "https://onedrive.live.com/embed?resid=ABCDEF1234567890!123&authkey=!AbCdEfGh12&em=2",
    );
    expect(
      parseEmbedUrl("https://sway.cloud.microsoft/s/abcdEFGH1234/embed"),
    ).toEqual({ provider: "microsoft-365", embedId: "sway:abcdEFGH1234" });
  });

  it("frames Microsoft Forms, full and short", () => {
    const id =
      "DQSIkWdsW0yxEjajBLZtrQAAAAAAAAAAAAMAAJ8Abc5UMkdBR0ZKNlFGUkhVQk5aOFdHVDhNVkFCNS4u";
    const form = parseEmbedUrl(
      `https://forms.office.com/Pages/ResponsePage.aspx?id=${id}&embed=true`,
    );
    expect(form).toEqual({ provider: "microsoft-forms", embedId: id });
    expect(form && embedPage(form)).toBe(
      `https://forms.office.com/Pages/ResponsePage.aspx?id=${id}`,
    );
    const short = parseEmbedUrl("https://forms.office.com/r/AbC123xyz");
    expect(short && embedSource(short)).toBe(
      "https://forms.office.com/r/AbC123xyz?embed=true",
    );
  });

  it("frames nothing from another host, or a share link that cannot be framed", () => {
    for (const address of [
      "https://evil.example.com/_layouts/15/Doc.aspx?sourcedoc={a1b2c3d4-1111-2222-3333-444455556666}",
      "https://contoso.sharepoint.com/:w:/s/Team/EaBcDeFgHiJ?e=AbCdEf",
      "https://contoso.sharepoint.com/sites/Science/_layouts/15/Doc.aspx?sourcedoc=not-a-guid",
      "https://sharepoint.com.evil.example/_layouts/15/Doc.aspx?sourcedoc={a1b2c3d4-1111-2222-3333-444455556666}",
    ])
      expect(parseEmbedUrl(address)).toBeNull();
  });

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

  it("reads embed code through its source address", () => {
    const code =
      '<iframe width="560" height="315" src="https://www.youtube.com/embed/RUSCz41aDug?si=OuILiNmyH6QtjUfj" title="YouTube video player" frameborder="0" allowfullscreen></iframe>';
    expect(isEmbedCode(code)).toBe(true);
    expect(parseEmbedInput(code)).toEqual({
      provider: "youtube",
      embedId: "RUSCz41aDug",
    });
    expect(
      parseEmbedInput("https://www.youtube.com/embed/RUSCz41aDug?si=abc"),
    ).toEqual({ provider: "youtube", embedId: "RUSCz41aDug" });
    expect(
      parseEmbedInput('<iframe src="https://evil.example/embed/x"></iframe>'),
    ).toBeNull();
    expect(isEmbedCode("see <iframe> for details")).toBe(false);
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
