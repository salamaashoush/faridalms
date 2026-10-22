import type { LtiLink } from "@faridalms/domain/lti";
import type {
  EditorConfig,
  EditorState,
  ElementNode,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import type { JSX } from "react";

import { $dfs } from "@lexical/utils";
import { $getDocument, $getNodeByKey, DecoratorNode } from "lexical";
import { useEffect } from "react";

import { useEditorEnvironment } from "../context";
import { LtiCard } from "../lti-card";
import { cx } from "../ui";
import { useNodeUpdate } from "./media";
import { useSelectOnClick } from "./select";

export type SerializedLtiNode = Spread<{ lti: LtiLink }, SerializedLexicalNode>;

function LtiBlock({ nodeKey, link }: { nodeKey: NodeKey; link: LtiLink }) {
  const { strings, tools } = useEditorEnvironment();
  const selected = useSelectOnClick(nodeKey);
  const update = useNodeUpdate(nodeKey, $isLtiNode);
  const tool = tools?.list.find((row) => row.id === link.toolId);
  const change = (patch: Partial<LtiLink>) =>
    update((node) => node.setLink({ ...node.getLink(), ...patch }));
  // A link starts with the school's first tool, which the teacher may change.
  const first = tools?.list[0];
  useEffect(() => {
    if (link.toolId || !first) return;
    update((node) =>
      node.setLink({
        ...node.getLink(),
        toolId: first.id,
        title: node.getLink().title || first.name,
      }),
    );
  }, [first, link.toolId, update]);
  return (
    <div className={cx(selected && "outline-2 outline-offset-2 outline-ring")}>
      <LtiCard
        title={link.title || tool?.name || strings.ltiTool}
        tool={tool?.name}
        href={tools?.href(link.linkId) ?? null}
        openLabel={strings.ltiOpen}
      >
        {tools ? (
          <span className="fe-lti-fields">
            <input
              aria-label={strings.ltiTitle}
              placeholder={tool?.name ?? strings.ltiTitle}
              value={link.title}
              maxLength={200}
              dir="auto"
              onChange={(event) => change({ title: event.target.value })}
            />
            {tools.list.length > 1 ? (
              <select
                aria-label={strings.ltiChooseTool}
                value={link.toolId}
                onChange={(event) => change({ toolId: event.target.value })}
              >
                {tools.list.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            ) : null}
          </span>
        ) : null}
      </LtiCard>
    </div>
  );
}

/**
 * A link to one of the school's outside tools, launched by LTI 1.3 signed
 * in as whoever opens it. Its id is its own: a copy in the same document
 * is given a new one, as LTI asks of a copied link.
 */
export class LtiNode extends DecoratorNode<JSX.Element> {
  __link: LtiLink;

  constructor(
    link: LtiLink = { linkId: "", toolId: "", title: "" },
    key?: NodeKey,
  ) {
    super(key);
    this.__link = link;
  }

  $config() {
    return this.config("lti", { extends: DecoratorNode });
  }

  static clone(node: LtiNode): LtiNode {
    return new LtiNode(node.__link, node.__key);
  }

  static importJSON(json: SerializedLtiNode): LtiNode {
    return new LtiNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedLtiNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__link = json.lti;
    return node;
  }

  exportJSON(): SerializedLtiNode {
    return { ...super.exportJSON(), lti: this.getLatest().__link };
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
    return this.getLatest().__link.title;
  }

  getLink(): LtiLink {
    return this.getLatest().__link;
  }

  setLink(link: LtiLink) {
    this.getWritable().__link = link;
  }

  decorate(_: unknown, __: EditorConfig): JSX.Element {
    return <LtiBlock nodeKey={this.getKey()} link={this.__link} />;
  }
}

export function $createLtiNode(toolId: string, title: string): LtiNode {
  return new LtiNode({ linkId: crypto.randomUUID(), toolId, title });
}

export function $isLtiNode(
  node: LexicalNode | null | undefined,
): node is LtiNode {
  return node instanceof LtiNode;
}

/**
 * Gives every link to a tool but one a new id where a copy shares it: the
 * link the document had before keeps its own, so launches stay with it.
 */
export function $uniqueLinkIds(root: ElementNode, previous: EditorState) {
  const byId = new Map<string, LtiNode[]>();
  for (const { node } of $dfs(root))
    if ($isLtiNode(node)) {
      const id = node.getLink().linkId;
      byId.set(id, [...(byId.get(id) ?? []), node]);
    }
  for (const [id, nodes] of byId) {
    if (nodes.length < 2) continue;
    const keeper =
      nodes.find((node) =>
        previous.read(() => {
          const before = $getNodeByKey(node.getKey());
          return $isLtiNode(before) && before.getLink().linkId === id;
        }),
      ) ?? nodes[0];
    for (const node of nodes)
      if (node !== keeper)
        node.setLink({ ...node.getLink(), linkId: crypto.randomUUID() });
  }
}
