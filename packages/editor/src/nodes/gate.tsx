import type { GateWaits } from "@faridalms/domain/content";
import type {
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import type { JSX } from "react";

import { GATE_WAITS } from "@faridalms/domain/content";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { $getDocument, $getNodeByKey, DecoratorNode } from "lexical";
import { ArrowDown } from "lucide-react";
import { useId, useState } from "react";

import { useEditorEnvironment } from "../context";
import { ownKeys, useSelectOnClick } from "./select";

export type SerializedGateNode = Spread<
  { requires?: GateWaits; goal?: number },
  SerializedLexicalNode
>;

/** A gate's goal when it first waits for some questions, or for a score: mastery is commonly put at four in five. */
const FIRST_GOAL: Partial<Record<GateWaits, number>> = { some: 1, score: 80 };

const hasGoal = (requires: GateWaits) =>
  requires === "some" || requires === "score";

/** How many questions, or what percent, a gate waits for; typed in, kept once it is a whole number in range. */
function GoalField({
  nodeKey,
  requires,
  goal,
}: {
  nodeKey: NodeKey;
  requires: GateWaits;
  goal: number;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const [draft, setDraft] = useState<string | null>(null);
  const id = useId();
  return (
    <span className="inline-flex items-center gap-1.5">
      <label htmlFor={id}>
        {requires === "score" ? strings.gateGoalScore : strings.gateGoalCount}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={100}
        value={draft ?? String(goal)}
        onChange={(event) => {
          setDraft(event.target.value);
          const value = Number(event.target.value);
          if (!Number.isInteger(value) || value < 1 || value > 100) return;
          editor.update(
            () => {
              const node = $getNodeByKey(nodeKey);
              if ($isGateNode(node)) node.setGoal(value);
            },
            { discrete: true },
          );
        }}
        onBlur={() => setDraft(null)}
        className="h-7 w-14 rounded-md border bg-background px-2 text-xs text-foreground tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      {requires === "score" ? <span aria-hidden>%</span> : null}
    </span>
  );
}

function GateBlock({
  nodeKey,
  requires,
  goal,
}: {
  nodeKey: NodeKey;
  requires: GateWaits;
  goal: number | undefined;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const editable = useLexicalEditable();
  const selected = useSelectOnClick(nodeKey);
  const id = useId();
  const labels: Record<GateWaits, string> = {
    above: strings.gateAbove,
    last: strings.gateLast,
    some: strings.gateSome,
    score: strings.gateScore,
    none: strings.gateNone,
  };
  const hints: Record<GateWaits, string> = {
    above: strings.gateHint,
    last: strings.gateHintLast,
    some: strings.gateHintSome(goal ?? 1),
    score: strings.gateHintScore(goal ?? 1),
    none: strings.gateHintNone,
  };
  return (
    <div
      className={`my-4 grid gap-1.5 rounded-lg py-2 ${selected ? "outline-2 outline-offset-2 outline-ring" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
          {strings.gate}
          <ArrowDown aria-hidden className="size-4" />
        </span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      {editable ? (
        <div
          ref={ownKeys}
          className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
        >
          <label htmlFor={id}>{strings.gateWaits}</label>
          <select
            id={id}
            value={requires}
            onChange={(event) => {
              const value = GATE_WAITS.find(
                (item) => item === event.target.value,
              );
              if (!value) return;
              editor.update(
                () => {
                  const node = $getNodeByKey(nodeKey);
                  if ($isGateNode(node)) node.setRequires(value);
                },
                { discrete: true },
              );
            }}
            className="h-7 rounded-md border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            {GATE_WAITS.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
          {hasGoal(requires) && goal !== undefined ? (
            <GoalField
              key={requires}
              nodeKey={nodeKey}
              requires={requires}
              goal={goal}
            />
          ) : null}
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          {hints[requires]}
        </p>
      )}
    </div>
  );
}

/**
 * Where a lesson stops until its student has done what the gate waits for
 * and chosen to go on: every question and video above, the one just above,
 * a number of the questions above, a score on them, or nothing. It has no
 * words, so it is a widget rather than text.
 */
export class GateNode extends DecoratorNode<JSX.Element> {
  __requires: GateWaits;
  __goal: number | undefined;

  constructor(requires: GateWaits = "above", goal?: number, key?: NodeKey) {
    super(key);
    this.__requires = requires;
    this.__goal = goal;
  }

  $config() {
    return this.config("gate", { extends: DecoratorNode });
  }

  static clone(node: GateNode): GateNode {
    return new GateNode(node.__requires, node.__goal, node.__key);
  }

  static importJSON(json: SerializedGateNode): GateNode {
    return new GateNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedGateNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__requires = json.requires ?? "above";
    node.__goal = hasGoal(node.__requires) ? json.goal : undefined;
    return node;
  }

  exportJSON(): SerializedGateNode {
    const { __requires: requires, __goal: goal } = this.getLatest();
    return {
      ...super.exportJSON(),
      ...(requires === "above" ? {} : { requires }),
      ...(goal === undefined ? {} : { goal }),
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

  getRequires(): GateWaits {
    return this.getLatest().__requires;
  }

  /** A count and a percent mean different things, so a change of kind starts its goal afresh. */
  setRequires(requires: GateWaits): this {
    const writable = this.getWritable();
    if (writable.__requires !== requires)
      writable.__goal = FIRST_GOAL[requires];
    writable.__requires = requires;
    return writable;
  }

  getGoal(): number | undefined {
    return this.getLatest().__goal;
  }

  setGoal(goal: number): this {
    const writable = this.getWritable();
    writable.__goal = goal;
    return writable;
  }

  decorate(_: unknown, __: EditorConfig): JSX.Element {
    return (
      <GateBlock
        nodeKey={this.getKey()}
        requires={this.__requires}
        goal={this.__goal}
      />
    );
  }
}

export function $isGateNode(
  node: LexicalNode | null | undefined,
): node is GateNode {
  return node instanceof GateNode;
}
