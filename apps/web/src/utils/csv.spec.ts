import { describe, expect, it } from "vitest";

import { csvCell, toCsv } from "./csv";

describe("csv export", () => {
  it("quotes separators, quotes and line breaks", () => {
    expect(csvCell('Salama "Sam" Ashoush')).toBe('"Salama ""Sam"" Ashoush"');
    expect(csvCell("P1-B, morning")).toBe('"P1-B, morning"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("keeps a spreadsheet from running a cell as a formula", () => {
    expect(csvCell('=HYPERLINK("http://example.com")')).toBe(
      '"\'=HYPERLINK(""http://example.com"")"',
    );
    expect(csvCell("+20 100 000 0000")).toBe("'+20 100 000 0000");
    expect(csvCell("@Salama")).toBe("'@Salama");
    expect(csvCell(-3)).toBe("-3");
  });

  it("writes absent values as empty cells and Arabic unchanged", () => {
    expect(toCsv([["سلامة عشوش", null, undefined, "GIC-2026-0001"]])).toBe(
      "سلامة عشوش,,,GIC-2026-0001",
    );
  });

  it("separates rows with CRLF", () => {
    expect(
      toCsv([
        ["Name", "Reference"],
        ["Salama Ashoush", "GIC-2026-0001"],
      ]),
    ).toBe("Name,Reference\r\nSalama Ashoush,GIC-2026-0001");
  });
});
