import type { GlossaryEntry } from "@faridalms/domain/glossary";
import type {
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
} from "lexical";
import type { JSX } from "react";

import { glossaryOf } from "@faridalms/domain/glossary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getDocument, DecoratorNode } from "lexical";
import { useEffect, useState } from "react";

import { useEditorEnvironment } from "../context";
import { GlossaryList } from "../glossary-view";
import { cx } from "../ui";
import { useSelectOnClick } from "./select";
import { $documentTerms } from "./term";

/** The document's terms, read again whenever the text changes. */
function useDocumentTerms(): GlossaryEntry[] {
  const [editor] = useLexicalComposerContext();
  const [terms, setTerms] = useState(() =>
    editor.getEditorState().read(() => $documentTerms()),
  );
  useEffect(
    () =>
      editor.registerUpdateListener(
        ({ editorState, dirtyElements, dirtyLeaves }) => {
          if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
          const next = editorState.read(() => $documentTerms());
          setTerms((current) =>
            JSON.stringify(current) === JSON.stringify(next) ? current : next,
          );
        },
      ),
    [editor],
  );
  return terms;
}

function GlossaryBlock({ nodeKey }: { nodeKey: NodeKey }) {
  const { strings, locale, media } = useEditorEnvironment();
  const selected = useSelectOnClick(nodeKey);
  const entries = glossaryOf(useDocumentTerms(), locale);
  return (
    <section
      aria-label={strings.glossary}
      className={cx(
        "fe-glossary",
        selected && "outline-2 outline-offset-2 outline-ring",
      )}
    >
      <GlossaryList entries={entries} url={media?.url} strings={strings} />
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{strings.glossaryEmpty}</p>
      ) : null}
    </section>
  );
}

/**
 * A glossary of the words the document defines, gathered as they are
 * defined, so a teacher keeps one list, not two that drift apart.
 */
export class GlossaryNode extends DecoratorNode<JSX.Element> {
  $config() {
    return this.config("glossary", { extends: DecoratorNode });
  }

  static clone(node: GlossaryNode): GlossaryNode {
    return new GlossaryNode(node.__key);
  }

  static importJSON(json: SerializedLexicalNode): GlossaryNode {
    return new GlossaryNode().updateFromJSON(json);
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

  decorate(_: unknown, __: EditorConfig): JSX.Element {
    return <GlossaryBlock nodeKey={this.getKey()} />;
  }
}

export function $isGlossaryNode(
  node: LexicalNode | null | undefined,
): node is GlossaryNode {
  return node instanceof GlossaryNode;
}
