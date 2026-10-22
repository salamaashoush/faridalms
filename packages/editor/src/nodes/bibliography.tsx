import type { FootnoteSource } from "@faridalms/domain/citations";
import type {
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
} from "lexical";
import type { JSX } from "react";

import { bibliographyOf } from "@faridalms/domain/bibliography";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $dfs } from "@lexical/utils";
import { $getDocument, DecoratorNode } from "lexical";
import { useEffect, useState } from "react";

import { BibliographyList } from "../bibliography-view";
import { useEditorEnvironment } from "../context";
import { cx } from "../ui";
import { $isFootnoteNode } from "./footnote";
import { useSelectOnClick } from "./select";

/** The sources the document's footnotes cite, in reading order. */
function $documentSources(): FootnoteSource[] {
  const found: FootnoteSource[] = [];
  for (const { node } of $dfs())
    if ($isFootnoteNode(node)) {
      const source = node.getSource();
      if (source) found.push(source);
    }
  return found;
}

/** The document's sources, read again whenever the text changes. */
function useDocumentSources(): FootnoteSource[] {
  const [editor] = useLexicalComposerContext();
  const [sources, setSources] = useState(() =>
    editor.getEditorState().read(() => $documentSources()),
  );
  useEffect(
    () =>
      editor.registerUpdateListener(
        ({ editorState, dirtyElements, dirtyLeaves }) => {
          if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
          const next = editorState.read(() => $documentSources());
          setSources((current) =>
            JSON.stringify(current) === JSON.stringify(next) ? current : next,
          );
        },
      ),
    [editor],
  );
  return sources;
}

function BibliographyBlock({ nodeKey }: { nodeKey: NodeKey }) {
  const { strings, locale } = useEditorEnvironment();
  const selected = useSelectOnClick(nodeKey);
  const list = bibliographyOf(useDocumentSources(), locale);
  return (
    <section
      aria-label={list ? undefined : strings.bibliography}
      className={cx(
        "fe-bibliography-block",
        selected && "outline-2 outline-offset-2 outline-ring",
      )}
    >
      {list ? (
        <BibliographyList bibliography={list} strings={strings} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {strings.bibliographyEmpty}
        </p>
      )}
    </section>
  );
}

/**
 * A reference list of the sources the document's footnotes cite, gathered
 * as they are cited, so the list never misses one or keeps one cut.
 */
export class BibliographyNode extends DecoratorNode<JSX.Element> {
  $config() {
    return this.config("bibliography", { extends: DecoratorNode });
  }

  static clone(node: BibliographyNode): BibliographyNode {
    return new BibliographyNode(node.__key);
  }

  static importJSON(json: SerializedLexicalNode): BibliographyNode {
    return new BibliographyNode().updateFromJSON(json);
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
    return <BibliographyBlock nodeKey={this.getKey()} />;
  }
}

export function $isBibliographyNode(
  node: LexicalNode | null | undefined,
): node is BibliographyNode {
  return node instanceof BibliographyNode;
}
