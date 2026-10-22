import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const teacher = () => signedIn("northwind", login("teacher", 0, 1));

const node = (identifier: string) => ({
  identifier,
  uri: `https://case.example.com/uri/${identifier}`,
  title: "",
});

/** A small CASE package: a strand with two standards under it. */
function casePackage(document: string, items: string[], extra = false) {
  const [strand, first, second, third] = items as [
    string,
    string,
    string,
    string,
  ];
  return {
    CFDocument: {
      identifier: document,
      title: "Example science",
      description: "Shared by an example board.",
      creator: "Example board",
    },
    CFItems: [
      {
        identifier: strand,
        fullStatement: "Living things",
        CFItemType: "Strand",
      },
      {
        identifier: first,
        fullStatement: "Name the parts of a plant.",
        humanCodingScheme: "SC.1",
      },
      {
        identifier: second,
        fullStatement: extra
          ? "Explain what roots and leaves do."
          : "Say what roots do.",
        humanCodingScheme: "SC.2",
      },
      ...(extra
        ? [
            {
              identifier: third,
              fullStatement: "Sort animals by what they eat.",
              humanCodingScheme: "SC.3",
            },
          ]
        : []),
    ],
    CFAssociations: [
      {
        identifier: crypto.randomUUID(),
        associationType: "isChildOf",
        originNodeURI: node(strand),
        destinationNodeURI: node(document),
      },
      ...[first, second, ...(extra ? [third] : [])].map((item, index) => ({
        identifier: crypto.randomUUID(),
        associationType: "isChildOf",
        originNodeURI: node(item),
        destinationNodeURI: node(strand),
        sequenceNumber: index + 1,
      })),
    ],
  };
}

describe("standards", () => {
  test("a school keeps its own framework, and teachers find its standards to tag", async () => {
    const office = await principal();
    const created = await office.standards.saveFramework({
      id: "",
      expectedVersion: 0,
      title: "Our reading goals",
      description: "",
    });
    const top = await office.standards.saveStandard({
      frameworkId: created.id,
      id: "",
      expectedVersion: 0,
      parentId: "",
      code: "RG.1",
      statement: "Read aloud with expression.",
      itemType: "Goal",
    });
    const second = await office.standards.saveStandard({
      frameworkId: created.id,
      id: "",
      expectedVersion: 0,
      parentId: "",
      code: "RG.2",
      statement: "Retell what was read.",
      itemType: "Goal",
    });
    const under = await office.standards.saveStandard({
      frameworkId: created.id,
      id: "",
      expectedVersion: 0,
      parentId: top.id,
      code: "RG.1.a",
      statement: "Pause at full stops.",
      itemType: "",
    });
    // Moving a standard under one beneath it would make a loop.
    expect(
      await rejection(
        office.standards.move({ id: top.id, parentId: under.id, position: 0 }),
      ),
    ).toMatchObject({ message: "standards.move" });
    await office.standards.move({ id: second.id, parentId: "", position: 0 });
    const opened = await office.standards.framework({ id: created.id });
    expect(
      opened.standards
        .filter((row) => row.parentId === null)
        .map((row) => row.code),
    ).toEqual(["RG.2", "RG.1"]);
    expect(opened.canManage).toBe(true);

    const staff = await teacher();
    expect(
      (await staff.standards.search({ query: "rg.1" })).map((row) => row.code),
    ).toEqual(["RG.1", "RG.1.a"]);
    expect(await staff.standards.describe({ ids: [under.id] })).toMatchObject([
      { code: "RG.1.a", frameworkTitle: "Our reading goals" },
    ]);
    expect(
      await rejection(
        staff.standards.saveFramework({
          id: created.id,
          expectedVersion: 1,
          title: "Mine now",
          description: "",
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });

    await office.standards.remove({ id: top.id });
    expect(
      (await office.standards.framework({ id: created.id })).standards.map(
        (row) => row.code,
      ),
    ).toEqual(["RG.2"]);
    await office.standards.removeFramework({ id: created.id });
    expect(await staff.standards.describe({ ids: [second.id] })).toEqual([]);
  });

  test("a CASE package imports as a framework, and importing it again updates it in place", async () => {
    const office = await principal();
    const document = crypto.randomUUID();
    const items = [1, 2, 3, 4].map(() => crypto.randomUUID());
    const first = await office.standards.importCase({
      frameworkId: "",
      casePackage: casePackage(document, items),
    });
    expect(first.imported).toBe(3);
    const before = await office.standards.framework({ id: first.id });
    expect(before.framework).toMatchObject({
      title: "Example science",
      caseIdentifier: document,
    });
    const sc2 = before.standards.find((row) => row.code === "SC.2");
    const strand = before.standards.find((row) => row.itemType === "Strand");
    expect(sc2?.parentId).toBe(strand?.id ?? "");

    const again = await office.standards.importCase({
      frameworkId: "",
      casePackage: casePackage(document, items, true),
    });
    expect(again).toMatchObject({ id: first.id, imported: 4 });
    const after = await office.standards.framework({ id: first.id });
    const sc2After = after.standards.find((row) => row.code === "SC.2");
    expect(sc2After).toMatchObject({
      id: sc2?.id,
      statement: "Explain what roots and leaves do.",
    });
    expect(after.standards.map((row) => row.code)).toContain("SC.3");
    await office.standards.removeFramework({ id: first.id });
  });
});
