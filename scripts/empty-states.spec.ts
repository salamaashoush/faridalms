import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { findAdHocEmptyStates, scanApps } from "./empty-states";

const messages = {
  invoicesNone: "No invoices yet.",
  wordsNone: "No word matches.",
  invoicesTitle: "Invoices",
  retireHint:
    "No class or programme may still use it. Grades given on it keep their grades.",
};

const find = (source: string) =>
  findAdHocEmptyStates("Page.tsx", source, messages).map((hit) => hit.text);

describe("hand-drawn empty states", () => {
  it("finds a muted line saying a list is empty", () => {
    expect(
      find(`{rows.length ? <List /> : (
        <p className="text-sm text-muted-foreground">{m.invoicesNone()}</p>
      )}`),
    ).toEqual(["No invoices yet."]);
  });

  it("finds an empty search result and a value that is not there", () => {
    expect(
      find(`if (shown.length === 0) return (
        <p className="py-4 text-sm text-muted-foreground">
          {words ? m.wordsNone() : m.invoicesNone()}
        </p>
      );
      const owner = row.owner ?? <span className="text-muted-foreground">Nobody yet</span>;`),
    ).toEqual(["No word matches.", "Nobody yet"]);
  });

  it("finds a dashed box standing in for content", () => {
    expect(
      find(`{program ? <Program /> : (
        <p className="rounded-lg border border-dashed px-4 py-3">{m.invoicesTitle()}</p>
      )}`),
    ).toEqual(["Invoices"]);
  });

  it("leaves hints, headings and the design system's own empty states", () => {
    expect(
      find(`<p className="text-sm text-muted-foreground">{m.retireHint()}</p>
        <h2 className="text-muted-foreground">{m.invoicesNone()}</h2>
        {rows.length ? <List /> : <EmptyState title={m.invoicesNone()} />}
        {row.owner ?? <Value absent="Nobody yet" />}`),
    ).toEqual([]);
  });

  it("finds none in the portal or the console", () => {
    const root = join(import.meta.dirname, "..");
    expect(scanApps(root)).toEqual([]);
  });
});
