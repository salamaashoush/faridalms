import type { GlossaryEntry } from "@faridalms/domain/glossary";
import type {
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
} from "lexical";
import type { JSX } from "react";

import { MAX_PANELS } from "@faridalms/domain/content";
import { glossaryOf } from "@faridalms/domain/glossary";
import { MAX_PAIRS } from "@faridalms/domain/learning";
import { contentOfLesson } from "@faridalms/domain/lesson-content";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getDocument,
  $isElementNode,
  $parseSerializedNode,
  DecoratorNode,
} from "lexical";
import { useEffect, useState } from "react";

import { useEditorEnvironment } from "../context";
import { GlossaryList } from "../glossary-view";
import { cx } from "../ui";
import { $createImageNode } from "./media";
import { $createPanel, $createPanelsNode } from "./panels";
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

/** The document's glossary as its reader sees it: each word once, defined, in order. */
export function $glossaryEntries(locale: string): GlossaryEntry[] {
  return glossaryOf($documentTerms(), locale);
}

/** Items in runs of at most `most`, as even as they split, so no run is left with one. */
function runsOf<T>(items: readonly T[], most: number): T[][] {
  const count = Math.ceil(items.length / most);
  const size = Math.ceil(items.length / count);
  return Array.from({ length: count }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

/**
 * A glossary as flash cards: each word on a card's front, and its meaning,
 * its word in the other language and its picture on the back, in sets as
 * large as a set of cards holds.
 */
export function $glossaryFlashCards(
  entries: readonly GlossaryEntry[],
): LexicalNode[] {
  return runsOf(entries, MAX_PANELS).map((run) => {
    const cards = $createPanelsNode("cards");
    for (const entry of run) {
      const card = $createPanel();
      const [front, back] = card.getChildren();
      if ($isElementNode(front)) front.append($createTextNode(entry.words));
      if ($isElementNode(back)) {
        const meaning = back.getFirstChild();
        if ($isElementNode(meaning))
          meaning.append($createTextNode(entry.definition));
        if (entry.gloss)
          back.append(
            $createParagraphNode().append($createTextNode(entry.gloss)),
          );
        if (entry.fileId)
          back.append(
            $createImageNode(entry.fileId, entry.alt ?? "", "medium"),
          );
      }
      cards.append(card);
    }
    return cards;
  });
}

/**
 * A glossary as matching questions, each word to its meaning, its picture
 * beside the word, as many questions as the words need at the most pairs
 * one question holds.
 */
export function $glossaryMatching(
  entries: readonly GlossaryEntry[],
  prompt: string,
): LexicalNode[] {
  const document = contentOfLesson({
    version: 2,
    blocks: runsOf(entries, MAX_PAIRS).map((run) => ({
      id: crypto.randomUUID(),
      type: "matching",
      prompt,
      points: 1,
      hints: [],
      explanation: "",
      tries: null,
      pairs: run.map((entry) => ({
        id: crypto.randomUUID(),
        prompt: entry.words.slice(0, 300),
        ...(entry.fileId
          ? { promptPicture: { fileId: entry.fileId, alt: entry.alt ?? "" } }
          : {}),
        answer: entry.definition.slice(0, 300),
      })),
      distractors: [],
    })),
  });
  return (document?.root.children ?? []).map((child) =>
    $parseSerializedNode(child as unknown as SerializedLexicalNode),
  );
}
