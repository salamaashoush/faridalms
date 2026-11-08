import type { ContentDocument } from "@faridalms/domain/content";

import { contentDocumentSchema } from "@faridalms/domain/content";
import { strToU8, zipSync } from "fflate";
import { $getRoot, $parseSerializedNode } from "lexical";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { buildContentEditor } from "./headless";
import { $isCmi5Node } from "./nodes/cmi5";
import { readCmi5Package } from "./plugins/cmi5";

const structure = (url: string) => `<?xml version="1.0"?>
<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd">
  <course id="https://publisher.example.com/course/1">
    <title><langstring lang="en-US">Floods</langstring></title>
    <description><langstring lang="en-US">A course.</langstring></description>
  </course>
  <au id="https://publisher.example.com/au/1" moveOn="Completed">
    <title><langstring lang="en-US">Floods, part one</langstring></title>
    <description><langstring lang="en-US">Part one.</langstring></description>
    <url>${url}</url>
  </au>
</courseStructure>`;

const zipped = (files: Record<string, string>) =>
  zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, text]) => [name, strToU8(text)]),
    ),
  );

describe("course packages", () => {
  it("reads a package's course when every unit it names is inside it", () => {
    const course = readCmi5Package(
      "floods.zip",
      zipped({
        "cmi5.xml": structure("one/index.html?start=1"),
        "one/index.html": "<!doctype html>",
      }),
      "en",
    );
    expect(course).toMatchObject({
      title: "Floods",
      aus: [{ title: "Floods, part one", url: "one/index.html?start=1" }],
    });

    // Kept in a lesson, the package saves as a block of its own.
    const target = buildContentEditor();
    target.update(
      () => {
        $getRoot()
          .clear()
          .append(
            $parseSerializedNode({
              type: "cmi5",
              version: 1,
              fileId: crypto.randomUUID(),
              cmi5: course,
            }),
          );
      },
      { discrete: true },
    );
    const document = target
      .getEditorState()
      .toJSON() as unknown as ContentDocument;
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(document.root.children?.[0]?.cmi5?.title).toBe("Floods");
    // Normal is not written; another mode the teacher chose is kept.
    expect(document.root.children?.[0]?.launchMode).toBeUndefined();
    target.update(
      () => {
        const node = $getRoot().getFirstChild();
        if ($isCmi5Node(node)) node.setLaunchMode("Review");
      },
      { discrete: true },
    );
    const reviewed = target
      .getEditorState()
      .toJSON() as unknown as ContentDocument;
    expect(v.safeParse(contentDocumentSchema, reviewed).success).toBe(true);
    expect(reviewed.root.children?.[0]?.launchMode).toBe("Review");
  });

  it("gives nothing for a zip without a structure, or one naming a missing unit", () => {
    expect(
      readCmi5Package("plain.zip", zipped({ "index.html": "" }), "en"),
    ).toBeNull();
    expect(
      readCmi5Package(
        "broken.zip",
        zipped({ "cmi5.xml": structure("two/index.html") }),
        "en",
      ),
    ).toBeNull();
  });
});
