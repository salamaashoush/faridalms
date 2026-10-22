import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { caseOutline, casePackageSchema } from "./standards";

const uuid = (n: number) =>
  `0190a1b2-0000-7000-8000-0000000003${String(n).padStart(2, "0")}`;
const document = uuid(0);
const node = (identifier: string) => ({
  identifier,
  uri: `https://case.example.com/uri/${identifier}`,
  title: "",
});
const child = (of: string, parent: string, sequenceNumber?: number) => ({
  identifier: crypto.randomUUID(),
  associationType: "isChildOf",
  originNodeURI: node(of),
  destinationNodeURI: node(parent),
  ...(sequenceNumber === undefined ? {} : { sequenceNumber }),
});

const casePackage = v.parse(casePackageSchema, {
  CFDocument: {
    identifier: document,
    title: "Reading and writing",
    creator: "Example board",
    uri: "https://case.example.com/doc",
  },
  CFItems: [
    { identifier: uuid(1), fullStatement: "Reading", CFItemType: "Strand" },
    {
      identifier: uuid(2),
      fullStatement: "Retell a story in order.",
      humanCodingScheme: "R.2",
    },
    {
      identifier: uuid(3),
      fullStatement: "Name a story's characters.",
      humanCodingScheme: "R.1",
    },
    { identifier: uuid(4), fullStatement: "Writing", CFItemType: "Strand" },
    { identifier: uuid(5), fullStatement: "", humanCodingScheme: "W.0" },
    { identifier: uuid(6), fullStatement: "A loop", humanCodingScheme: "L" },
    {
      identifier: uuid(7),
      fullStatement: "Its partner",
      humanCodingScheme: "M",
    },
  ],
  CFAssociations: [
    child(uuid(1), document, 1),
    child(uuid(4), document, 2),
    child(uuid(2), uuid(1), 2),
    child(uuid(3), uuid(1), 1),
    // A second parent for the same item is not followed.
    child(uuid(3), uuid(4)),
    child(uuid(5), uuid(4)),
    { ...child(uuid(1), uuid(4)), associationType: "isPeerOf" },
    child(uuid(6), uuid(7)),
    child(uuid(7), uuid(6)),
  ],
});

describe("CASE packages", () => {
  it("make a tree in the package's order, parents before their children", () => {
    const outline = caseOutline(casePackage);
    expect(outline).toMatchObject({
      identifier: document,
      title: "Reading and writing",
    });
    const reading = outline.items.find((item) => item.identifier === uuid(1));
    expect(reading).toMatchObject({
      parentIdentifier: null,
      itemType: "Strand",
    });
    const under = outline.items
      .filter((item) => item.parentIdentifier === uuid(1))
      .map((item) => [item.code, item.position]);
    expect(under).toEqual([
      ["R.1", 0],
      ["R.2", 1],
    ]);
    const order = outline.items.map((item) => item.identifier);
    const beforeParent = outline.items.filter(
      (item, index) =>
        item.parentIdentifier !== null &&
        !order.slice(0, index).includes(item.parentIdentifier),
    );
    expect(beforeParent).toEqual([]);
  });

  it("leave out an item with nothing to say, and break a loop at the top", () => {
    const outline = caseOutline(casePackage);
    expect(outline.items.map((item) => item.code)).not.toContain("W.0");
    const looped = outline.items.filter((item) =>
      ["L", "M"].includes(item.code),
    );
    expect(looped).toHaveLength(2);
    expect(looped.some((item) => item.parentIdentifier === null)).toBe(true);
  });
});
