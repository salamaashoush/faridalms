import type {
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import type { JSX } from "react";

import {
  $createNodeSelection,
  $getDocument,
  $setSelection,
  DecoratorNode,
} from "lexical";
import { Shuffle } from "lucide-react";
import { useEffect, useState } from "react";

import type { BankTag, EditorBank } from "../context";

import { useEditorEnvironment } from "../context";
import { cx } from "../ui";
import { useSelectOnClick } from "./select";

export type SerializedDrawNode = Spread<
  { questionId: string; bankTag: string; count: number; points: number },
  SerializedLexicalNode
>;

/** The bank's tags with how many questions carry each, once the bank answers. */
export function useBankTags(bank: EditorBank | undefined): BankTag[] | null {
  const [tags, setTags] = useState<BankTag[] | null>(null);
  useEffect(() => {
    if (!bank) return undefined;
    let current = true;
    void bank.tags().then(
      (found) => {
        if (current) setTags(found);
      },
      () => {
        if (current) setTags([]);
      },
    );
    return () => {
      current = false;
    };
  }, [bank]);
  return tags;
}

function DrawBlock({
  nodeKey,
  tag,
  count,
  points,
}: {
  nodeKey: NodeKey;
  tag: string;
  count: number;
  points: number;
}) {
  const { strings, bank } = useEditorEnvironment();
  const selected = useSelectOnClick(nodeKey);
  const tags = useBankTags(bank);
  const available = tag
    ? (tags?.find((item) => item.tag === tag)?.questions ?? 0)
    : null;
  const short = tags !== null && available !== null && available < count;
  return (
    <div
      className={cx(
        "my-4 grid gap-1 rounded-lg border border-dashed bg-muted/40 px-4 py-3",
        selected && "outline-2 outline-offset-2 outline-ring",
      )}
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <Shuffle aria-hidden className="size-4 shrink-0 text-primary" />
        {strings.drawTitle}
      </p>
      <p className="text-sm" dir="auto">
        {tag ? (
          <>
            {strings.drawSummary(count, tag)}
            <span className="text-muted-foreground">
              {" · "}
              {strings.drawPointsEach(points)}
            </span>
          </>
        ) : (
          <span className="text-destructive">{strings.drawNoTag}</span>
        )}
      </p>
      <p
        className={cx(
          "text-xs",
          short ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {short ? strings.drawShort(available) : strings.drawHint}
      </p>
    </div>
  );
}

/**
 * Questions a quiz draws from the bank for each attempt: so many carrying a
 * tag, each worth the same, so every student's quiz is worth the same
 * whichever questions they drew. It stands where they are asked.
 */
export class DrawNode extends DecoratorNode<JSX.Element> {
  __drawId: string;
  __tag: string;
  __count: number;
  __points: number;

  constructor(
    drawId: string = crypto.randomUUID(),
    tag = "",
    count = 3,
    points = 1,
    key?: NodeKey,
  ) {
    super(key);
    this.__drawId = drawId;
    this.__tag = tag;
    this.__count = count;
    this.__points = points;
  }

  $config() {
    return this.config("draw", { extends: DecoratorNode });
  }

  static clone(node: DrawNode): DrawNode {
    return new DrawNode(
      node.__drawId,
      node.__tag,
      node.__count,
      node.__points,
      node.__key,
    );
  }

  static importJSON(json: SerializedDrawNode): DrawNode {
    return new DrawNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedDrawNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__drawId = json.questionId;
    node.__tag = json.bankTag;
    node.__count = json.count;
    node.__points = json.points;
    return node;
  }

  exportJSON(): SerializedDrawNode {
    const node = this.getLatest();
    return {
      ...super.exportJSON(),
      questionId: node.__drawId,
      bankTag: node.__tag,
      count: node.__count,
      points: node.__points,
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

  getDrawId(): string {
    return this.getLatest().__drawId;
  }

  setDrawId(drawId: string): this {
    const writable = this.getWritable();
    writable.__drawId = drawId;
    return writable;
  }

  getSettings(): { tag: string; count: number; points: number } {
    const node = this.getLatest();
    return { tag: node.__tag, count: node.__count, points: node.__points };
  }

  setSettings(
    settings: Partial<{ tag: string; count: number; points: number }>,
  ): this {
    const writable = this.getWritable();
    if (settings.tag !== undefined) writable.__tag = settings.tag;
    if (settings.count !== undefined) writable.__count = settings.count;
    if (settings.points !== undefined) writable.__points = settings.points;
    return writable;
  }

  decorate(_: unknown, __: EditorConfig): JSX.Element {
    return (
      <DrawBlock
        nodeKey={this.getKey()}
        tag={this.__tag}
        count={this.__count}
        points={this.__points}
      />
    );
  }
}

export function $isDrawNode(
  node: LexicalNode | null | undefined,
): node is DrawNode {
  return node instanceof DrawNode;
}

/** Chooses a draw, which opens its tag, count and points in the floating bar. */
export function $selectDraw(node: DrawNode) {
  const selection = $createNodeSelection();
  selection.add(node.getKey());
  $setSelection(selection);
}
