import type { Cmi5Package } from "@faridalms/domain/cmi5";
import type {
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import type { JSX } from "react";

import { $getDocument, DecoratorNode } from "lexical";

import { Cmi5Card } from "../cmi5-card";
import { useEditorEnvironment } from "../context";
import { cx } from "../ui";
import { useSelectOnClick } from "./select";

export type SerializedCmi5Node = Spread<
  { fileId: string; cmi5: Cmi5Package },
  SerializedLexicalNode
>;

function Cmi5Block({
  nodeKey,
  course,
}: {
  nodeKey: NodeKey;
  course: Cmi5Package;
}) {
  const { strings } = useEditorEnvironment();
  const selected = useSelectOnClick(nodeKey);
  return (
    <div className={cx(selected && "outline-2 outline-offset-2 outline-ring")}>
      <Cmi5Card
        course={course}
        href={null}
        startLabel={strings.cmi5Start}
        unitsLabel={strings.cmi5Units(course.aus.length)}
      />
    </div>
  );
}

/**
 * A course package in the cmi5 profile, kept as the zip it came in with
 * the course its cmi5.xml describes; whoever reads the lesson launches its
 * units. Its id is its own, which a copy keeps, so a copied package is the
 * same course to the students who started it.
 */
export class Cmi5Node extends DecoratorNode<JSX.Element> {
  __fileId: string;
  __course: Cmi5Package;

  constructor(fileId = "", course?: Cmi5Package, key?: NodeKey) {
    super(key);
    this.__fileId = fileId;
    this.__course = course ?? {
      packageId: crypto.randomUUID(),
      courseId: "",
      title: "",
      aus: [],
    };
  }

  $config() {
    return this.config("cmi5", { extends: DecoratorNode });
  }

  static clone(node: Cmi5Node): Cmi5Node {
    return new Cmi5Node(node.__fileId, node.__course, node.__key);
  }

  static importJSON(json: SerializedCmi5Node): Cmi5Node {
    return new Cmi5Node().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedCmi5Node>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__fileId = json.fileId;
    node.__course = json.cmi5;
    return node;
  }

  exportJSON(): SerializedCmi5Node {
    const latest = this.getLatest();
    return {
      ...super.exportJSON(),
      fileId: latest.__fileId,
      cmi5: latest.__course,
    };
  }

  createDOM(): HTMLElement {
    return $getDocument().createElement("div");
  }

  updateDOM(): boolean {
    return false;
  }

  isInline(): false {
    return false;
  }

  getTextContent(): string {
    return this.getLatest().__course.title;
  }

  decorate(_: unknown, __: EditorConfig): JSX.Element {
    return <Cmi5Block nodeKey={this.getKey()} course={this.__course} />;
  }
}

export function $isCmi5Node(
  node: LexicalNode | null | undefined,
): node is Cmi5Node {
  return node instanceof Cmi5Node;
}
