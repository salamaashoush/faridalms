import { describe, expect, it } from "vitest";

import { CommonsBusy, commonsSearcher, commonsUserAgent } from "./commons";

const answer = {
  query: {
    pages: [
      {
        title: "File:Camel.jpg",
        index: 0,
        imageinfo: [
          {
            url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Camel.jpg",
            thumburl:
              "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Camel.jpg/1280px-Camel.jpg",
            descriptionurl: "https://commons.wikimedia.org/wiki/File:Camel.jpg",
            extmetadata: {
              Artist: { value: "A. Photographer" },
              LicenseShortName: { value: "CC BY-SA 4.0" },
            },
          },
        ],
      },
    ],
  },
};

function recorder(responses: (() => Response)[]) {
  const asked: { url: string; userAgent: string | null; at: number }[] = [];
  let open = 0;
  let most = 0;
  const fetcher = async (url: string, init: RequestInit) => {
    open += 1;
    most = Math.max(most, open);
    asked.push({
      url,
      userAgent: new Headers(init.headers).get("user-agent"),
      at: Date.now(),
    });
    await new Promise((done) => setTimeout(done, 5));
    open -= 1;
    return (responses.shift() ?? (() => Response.json(answer)))();
  };
  return { asked, fetcher, most: () => most };
}

describe("searching Wikimedia Commons", () => {
  it("names the platform and how to reach whoever runs it, with no one's email", () => {
    const agent = commonsUserAgent("https://faridalms.example/");
    expect(agent).toBe(
      "FaridaLMS/1.0 (https://faridalms.example/; picture search for school staff)",
    );
    expect(agent).not.toMatch(/@/);
  });

  it("asks one at a time with a gap between, and keeps an answer for a search typed again", async () => {
    const { asked, fetcher, most } = recorder([]);
    const search = commonsSearcher("https://faridalms.example/", fetcher);
    const [first, second] = await Promise.all([
      search("camel", "en"),
      search("desert", "en"),
    ]);
    expect(first.map((picture) => picture.title)).toEqual(["File:Camel.jpg"]);
    expect(second).toHaveLength(1);
    expect(most()).toBe(1);
    expect(asked).toHaveLength(2);
    expect((asked[1]?.at ?? 0) - (asked[0]?.at ?? 0)).toBeGreaterThanOrEqual(
      390,
    );
    expect(asked[0]?.userAgent).toMatch(/^FaridaLMS\//);
    await search("Camel", "en");
    expect(asked).toHaveLength(2);
  });

  it("holds off for as long as Commons asks when it is busy", async () => {
    const { asked, fetcher } = recorder([
      () =>
        new Response(null, { status: 429, headers: { "retry-after": "60" } }),
    ]);
    const search = commonsSearcher("https://faridalms.example/", fetcher);
    await expect(search("camel", "en")).rejects.toBeInstanceOf(CommonsBusy);
    await expect(search("desert", "en")).rejects.toBeInstanceOf(CommonsBusy);
    expect(asked).toHaveLength(1);
  });
});
