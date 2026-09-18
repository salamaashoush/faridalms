import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "./MarkdownContent";

describe("message Markdown", () => {
  it("renders formatting, task lists and tables", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>
        {
          "## Learning plan\n\n**Read** with _Salama_.\n\n- [x] Finished\n\n| Day |\n| --- |\n| Monday |"
        }
      </MarkdownContent>,
    );
    expect(html).toContain("<h2>Learning plan</h2>");
    expect(html).toContain("<strong>Read</strong>");
    expect(html).toContain("<em>Salama</em>");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<td>Monday</td>");
  });
  it("keeps HTML inert and refuses executable links", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>
        {
          "<script>alert(1)</script>\n\n[Open](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>"
        }
      </MarkdownContent>,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("&lt;script&gt;");
  });
  it("does not load remote tracking images when a conversation opens", () => {
    const html = renderToStaticMarkup(
      <MarkdownContent>
        {"![Class photograph](https://example.com/tracking.gif)"}
      </MarkdownContent>,
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("tracking.gif");
    expect(html).toContain("Class photograph");
  });
});
