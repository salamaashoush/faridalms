import type { NodeKey } from "lexical";

import { Menu } from "@base-ui/react/menu";
import { $isCodeNode, CodeNode } from "@lexical/code";
import { getCodeLanguageOptions } from "@lexical/code-prism";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { $getNodeByKey } from "lexical";
import { Check, ChevronDown, Copy, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { CodeRun } from "../nodes";
import type { EditorStrings } from "../strings";

import { $currentBlock } from "../blocks";
import { codeGutter, codeLanguageName } from "../code-language";
import { useEditorEnvironment } from "../context";
import { $codeRunOf, $setCodeRun, runnableLanguage } from "../nodes";
import {
  cx,
  menuItemClass,
  menuPopupClass,
  sameJson,
  Tip,
  useListenerState,
} from "../ui";

/** What the block's header says: its language, and whether students run it. */
export function codeLabel(
  language: string | null | undefined,
  run: CodeRun | null,
  strings: Pick<EditorStrings, "codeRun" | "codePredict">,
): string {
  const name = codeLanguageName(language);
  const doing =
    run === "run"
      ? strings.codeRun
      : run === "predict"
        ? strings.codePredict
        : "";
  return [name, doing].filter(Boolean).join(" · ");
}

interface Active {
  key: string;
  language: string;
  run: CodeRun | null;
  top: number;
  right: number;
}

const trigger =
  "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:bg-accent data-popup-open:text-foreground [&_svg]:size-3.5";

/**
 * A code block's header: its language and line numbers drawn by the block
 * itself, and, while the caret is in it, a menu of languages, what students
 * do with it, and a button that copies it.
 */
export function CodeBlockPlugin({ anchor }: { anchor: HTMLElement | null }) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const [active, setActive] = useListenerState<Active | null>(null, sameJson);
  const [copied, setCopied] = useState(false);
  const options = useMemo(
    () => getCodeLanguageOptions().filter(([value]) => value !== "plain"),
    [],
  );

  useEffect(() => {
    let marked: HTMLElement | null = null;
    let shown: NodeKey | null = null;
    let frame = 0;
    return mergeRegister(
      editor.registerMutationListener(
        CodeNode,
        (mutations) => {
          editor.getEditorState().read(() => {
            for (const [key, mutation] of mutations) {
              if (mutation === "destroyed") continue;
              const node = $getNodeByKey(key);
              const element = editor.getElementByKey(key);
              if (!$isCodeNode(node) || !element) continue;
              const run = runnableLanguage(node.getLanguage())
                ? $codeRunOf(node)
                : null;
              element.dataset.label = codeLabel(
                node.getLanguage(),
                run,
                strings,
              );
              element.dataset.gutter = codeGutter(node.getTextContent());
              if (run) element.dataset.run = run;
              else delete element.dataset.run;
            }
          });
        },
        { skipInitialization: false },
      ),
      // The block the caret is in is marked at once; where its header
      // goes is read in the frame that draws the change, once, and drawn
      // again only when it moved.
      editor.registerUpdateListener(({ editorState }) => {
        const found = editorState.read(() => {
          const block = $currentBlock();
          return $isCodeNode(block)
            ? {
                key: block.getKey(),
                language: block.getLanguage() ?? "",
                run: $codeRunOf(block),
              }
            : null;
        });
        const element = found ? editor.getElementByKey(found.key) : null;
        if (marked && marked !== element) delete marked.dataset.active;
        marked = null;
        cancelAnimationFrame(frame);
        if (!found || !element || !anchor || !editor.isEditable()) {
          shown = null;
          setActive(null);
          return;
        }
        element.dataset.active = "";
        marked = element;
        frame = requestAnimationFrame(() => {
          const box = anchor.getBoundingClientRect();
          const rect = element.getBoundingClientRect();
          const next = {
            ...found,
            top: Math.round(rect.top - box.top + anchor.scrollTop + 4),
            right: Math.round(box.right - rect.right + 6),
          };
          if (shown !== next.key) setCopied(false);
          shown = next.key;
          setActive(next);
        });
      }),
      () => {
        cancelAnimationFrame(frame);
        if (marked) delete marked.dataset.active;
      },
    );
  }, [editor, anchor, strings, setActive]);

  if (!active) return null;
  const change = (apply: (node: CodeNode) => void) =>
    editor.update(() => {
      const node = $getNodeByKey(active.key);
      if ($isCodeNode(node)) apply(node);
    });
  const copy = () => {
    const text = editor
      .getEditorState()
      .read(() => $getNodeByKey(active.key)?.getTextContent() ?? "");
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const runs = runnableLanguage(active.language);
  const runLabel =
    active.run === "run"
      ? strings.codeRun
      : active.run === "predict"
        ? strings.codePredict
        : strings.codeRead;

  return (
    <div
      data-code-tools=""
      // Measured from the screen, and a code block always reads left to right.
      style={{ top: active.top, right: active.right }}
      className="absolute z-10 flex items-center gap-0.5"
      dir="ltr"
    >
      <Menu.Root>
        <Menu.Trigger
          aria-label={strings.codeLanguage}
          className={cx(trigger, "font-medium")}
        >
          {codeLanguageName(active.language) ?? strings.plainText}
          <ChevronDown aria-hidden />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            side="bottom"
            align="end"
            sideOffset={4}
            className="z-50"
          >
            <Menu.Popup
              className={cx(menuPopupClass, "max-h-72 overflow-y-auto")}
            >
              <Menu.RadioGroup
                value={active.language}
                onValueChange={(value: string) =>
                  change((node) => {
                    node.setLanguage(value || null);
                    if (!runnableLanguage(value)) $setCodeRun(node, null);
                  })
                }
              >
                {[["", strings.plainText] as const, ...options].map(
                  ([value, name]) => (
                    <Menu.RadioItem
                      key={value}
                      value={value}
                      closeOnClick
                      className={menuItemClass}
                    >
                      <Menu.RadioItemIndicator
                        keepMounted
                        className="flex size-4 items-center justify-center data-unchecked:invisible"
                      >
                        <Check aria-hidden />
                      </Menu.RadioItemIndicator>
                      {name}
                    </Menu.RadioItem>
                  ),
                )}
              </Menu.RadioGroup>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      {runs ? (
        <Menu.Root>
          <Menu.Trigger
            aria-label={strings.codeStudents}
            className={cx(trigger, active.run && "text-primary")}
          >
            <Play aria-hidden />
            {runLabel}
            <ChevronDown aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner
              side="bottom"
              align="end"
              sideOffset={4}
              className="z-50"
            >
              <Menu.Popup className={menuPopupClass}>
                <Menu.RadioGroup
                  value={active.run ?? ""}
                  onValueChange={(value: string) =>
                    change((node) =>
                      $setCodeRun(
                        node,
                        value === "run" || value === "predict" ? value : null,
                      ),
                    )
                  }
                >
                  {(
                    [
                      ["", strings.codeRead],
                      ["run", strings.codeRun],
                      ["predict", strings.codePredict],
                    ] as const
                  ).map(([value, name]) => (
                    <Menu.RadioItem
                      key={value}
                      value={value}
                      closeOnClick
                      className={menuItemClass}
                    >
                      <Menu.RadioItemIndicator
                        keepMounted
                        className="flex size-4 items-center justify-center data-unchecked:invisible"
                      >
                        <Check aria-hidden />
                      </Menu.RadioItemIndicator>
                      {name}
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ) : null}
      <Tip label={copied ? strings.codeCopied : strings.codeCopy}>
        <button
          type="button"
          aria-label={copied ? strings.codeCopied : strings.codeCopy}
          onMouseDown={(event) => event.preventDefault()}
          onClick={copy}
          className={trigger}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </button>
      </Tip>
    </div>
  );
}
