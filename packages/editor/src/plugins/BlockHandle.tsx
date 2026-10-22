import type { ColumnLayout, PanelLayout } from "@faridalms/domain/content";
import type { ElementNode, LexicalNode, NodeKey } from "lexical";

import { Menu } from "@base-ui/react/menu";
import {
  calloutTones,
  columnLayouts,
  MAX_PANELS,
  panelLayouts,
} from "@faridalms/domain/content";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import {
  $createParagraphNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isRootNode,
  COMMAND_PRIORITY_LOW,
  KEY_DOWN_COMMAND,
  isHTMLElement,
} from "lexical";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Copy,
  GripVertical,
  LayoutTemplate,
  Palette,
  Plus,
  Repeat2,
  Trash2,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { BlockType } from "../blocks";

import {
  $blockTypeOf,
  $currentBlock,
  $duplicateBlock,
  $isConvertible,
  $moveBlock,
  $turnInto,
  blockDefinitions,
} from "../blocks";
import { useEditorEnvironment } from "../context";
import {
  $createPanel,
  $isCalloutNode,
  $isPanelsNode,
  $isStarterNode,
  $isColumnsNode,
  $nearestBlock,
  $createColumnNode,
  columnCount,
} from "../nodes";
import { $narrationOf } from "../nodes/narration";
import { textFocus, updateFromOutside } from "../outside";
import { Tip, cx, menuItemClass, menuPopupClass, shortcutLabel } from "../ui";
import { OPEN_NARRATION_COMMAND } from "./narration";

const DRAG_TYPE = "application/x-farida-block";
const HANDLE_WIDTH = 44;
const HANDLE_HEIGHT = 24;

interface Hovered {
  key: NodeKey;
  element: HTMLElement;
}

interface BlockFacts {
  type: BlockType | null;
  convertible: boolean;
  callout: string | null;
  layout: ColumnLayout | null;
  /** How a set of parts reads, and how many parts it has. */
  panels: { layout: PanelLayout; count: number } | null;
  first: boolean;
  last: boolean;
  /** Whether it may be read aloud, and whether it is. */
  narration: "none" | "empty" | "recorded";
}

// Blocks with nothing to read aloud.
const SILENT = new Set([
  "panels",
  "gate",
  "draw",
  "standards",
  "horizontalrule",
  "pagebreak",
  "starter",
  "columns",
]);

function isModifier(event: KeyboardEvent) {
  return event.metaKey || event.ctrlKey;
}

function isRtl(element: HTMLElement | null) {
  return element ? getComputedStyle(element).direction === "rtl" : false;
}

function firstLine(element: HTMLElement): DOMRect | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ALL, {
    acceptNode: (node) =>
      (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) ||
      node instanceof HTMLBRElement
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP,
  });
  const node = walker.nextNode();
  if (!node) return null;
  const range = document.createRange();
  if (node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, 0);
    range.setEnd(node, 1);
  } else range.selectNode(node);
  const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
  return rect.height ? rect : null;
}

function $handleBlock(node: LexicalNode): LexicalNode | null {
  let block = $nearestBlock(node, false);
  while (
    block &&
    ($isCalloutNode(block.getParent()) || $isStarterNode(block.getParent()))
  ) {
    const parent = block.getParent();
    block = parent ? $nearestBlock(parent, false) : null;
  }
  return block;
}

function segments(layout: ColumnLayout) {
  let start = 0;
  return layout.split(":").map((part) => {
    const size = Number(part);
    const key = `${start}-${start + size}`;
    start += size;
    return { key, size };
  });
}

function $removeBlock(block: LexicalNode) {
  const parent = block.getParent();
  const next = block.getNextSibling() ?? block.getPreviousSibling();
  block.remove();
  if ($isRootNode(parent) && parent.isEmpty())
    parent.append($createParagraphNode()).selectStart();
  else if ($isElementNode(next)) next.selectStart();
}

function $setLayout(block: LexicalNode, layout: ColumnLayout) {
  if (!$isColumnsNode(block)) return;
  const count = columnCount(layout);
  const columns = block.getChildren();
  for (let index = columns.length; index < count; index++)
    block.append($createColumnNode().append($createParagraphNode()));
  const last = columns[count - 1];
  for (const extra of columns.slice(count)) {
    if ($isElementNode(extra) && $isElementNode(last))
      last.append(...extra.getChildren());
    extra.remove();
  }
  block.setLayout(layout);
}

export function BlockHandlePlugin({ anchor }: { anchor: HTMLElement | null }) {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const { strings, media, narration } = useEditorEnvironment();
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [menu, setMenu] = useState(false);
  const [facts, setFacts] = useState<BlockFacts | null>(null);
  const handle = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const grip = useRef<HTMLButtonElement>(null);
  const dragging = useRef<NodeKey | null>(null);
  const drop = useRef<{ key: NodeKey; after: boolean } | null>(null);
  const hidden = useRef(false);

  const blockAt = useCallback(
    (event: MouseEvent): Hovered | null => {
      const root = editor.getRootElement();
      if (!root || !anchor) return null;
      let target: Element | null = isHTMLElement(event.target)
        ? event.target
        : null;
      if (!target || !root.contains(target)) {
        const rect = root.getBoundingClientRect();
        const x = isRtl(anchor) ? rect.right - 24 : rect.left + 24;
        const y = Math.min(
          Math.max(event.clientY, rect.top + 1),
          rect.bottom - 1,
        );
        target = document.elementFromPoint(x, y);
        if (!target || !root.contains(target)) return null;
      }
      const from = target;
      return editor.read(() => {
        const node = $getNearestNodeFromDOMNode(from);
        const block = node ? $handleBlock(node) : null;
        if (!block) return null;
        const element = editor.getElementByKey(block.getKey());
        return element ? { key: block.getKey(), element } : null;
      });
    },
    [editor, anchor],
  );

  useEffect(() => {
    if (!anchor || !editable) return undefined;
    const onMove = (event: MouseEvent) => {
      hidden.current = false;
      if (dragging.current || menu) return;
      if (isHTMLElement(event.target) && handle.current?.contains(event.target))
        return;
      const next = blockAt(event);
      setHovered((current) =>
        current?.key === next?.key && current?.element === next?.element
          ? current
          : next,
      );
    };
    const onLeave = () => {
      if (!menu && !dragging.current) setHovered(null);
    };
    anchor.addEventListener("mousemove", onMove);
    anchor.addEventListener("mouseleave", onLeave);
    return () => {
      anchor.removeEventListener("mousemove", onMove);
      anchor.removeEventListener("mouseleave", onLeave);
    };
  }, [anchor, editable, menu, blockAt]);

  useEffect(() => {
    if (!editable) return undefined;
    const coarse = window.matchMedia("(hover: none)");
    return editor.registerUpdateListener(({ editorState }) => {
      if (!coarse.matches || menu) return;
      const next = editorState.read(() => {
        const current = $currentBlock(false);
        const block = current ? $handleBlock(current) : null;
        const element = block ? editor.getElementByKey(block.getKey()) : null;
        return block && element ? { key: block.getKey(), element } : null;
      });
      setHovered(next);
    });
  }, [editor, editable, menu]);

  useEffect(() => {
    const element = handle.current;
    if (!element || !anchor) return;
    if (!hovered || !hovered.element.isConnected) {
      element.style.opacity = "0";
      element.style.pointerEvents = "none";
      return;
    }
    const block = hovered.element.getBoundingClientRect();
    const box = anchor.getBoundingClientRect();
    const first = firstLine(hovered.element);
    const center = first
      ? first.top + first.height / 2
      : block.top + Math.min(block.height, 28) / 2;
    const top = center - box.top + anchor.scrollTop - HANDLE_HEIGHT / 2;
    const left = isRtl(anchor)
      ? block.right - box.left + 2
      : block.left - box.left - HANDLE_WIDTH - 2;
    element.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    element.style.opacity = hidden.current ? "0" : "1";
    element.style.pointerEvents = "auto";
  });

  const openMenu = useCallback(
    (key: NodeKey) => {
      const next = editor.read(() => {
        const block = $getNodeByKey(key);
        if (!block) return null;
        return {
          type: $blockTypeOf(block),
          convertible: $isConvertible(block),
          callout: $isCalloutNode(block) ? block.getTone() : null,
          layout: $isColumnsNode(block) ? block.getLayout() : null,
          panels: $isPanelsNode(block)
            ? { layout: block.getLayout(), count: block.getChildrenSize() }
            : null,
          first: !block.getPreviousSibling(),
          last: !block.getNextSibling(),
          narration:
            !narration || !media || SILENT.has(block.getType())
              ? "none"
              : $narrationOf(block)
                ? "recorded"
                : "empty",
        } satisfies BlockFacts;
      });
      if (!next) return;
      setFacts(next);
      setMenu(true);
    },
    [editor, narration, media],
  );

  useEffect(
    () =>
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (!menu && handle.current) {
            hidden.current = true;
            handle.current.style.opacity = "0";
          }
          if (isModifier(event) && event.key === "/") {
            const block = $currentBlock(false);
            const element = block
              ? editor.getElementByKey(block.getKey())
              : null;
            if (!block || !element) return false;
            event.preventDefault();
            hidden.current = false;
            setHovered({ key: block.getKey(), element });
            openMenu(block.getKey());
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, menu, openMenu],
  );

  const act = (change: (block: LexicalNode) => void) => {
    const key = hovered?.key;
    setMenu(false);
    if (!key) return;
    updateFromOutside(editor, () => {
      const block = $getNodeByKey(key);
      if (block) change(block);
    });
  };

  useEffect(() => {
    if (!anchor || !editable) return undefined;
    const hideLine = () => {
      if (line.current) line.current.style.opacity = "0";
      drop.current = null;
    };
    const onOver = (event: DragEvent) => {
      if (!dragging.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      const target = blockAt(event);
      const box = anchor.getBoundingClientRect();
      if (!target || !line.current) return hideLine();
      const rect = target.element.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      drop.current = { key: target.key, after };
      const top = (after ? rect.bottom : rect.top) - box.top + anchor.scrollTop;
      line.current.style.transform = `translate(${Math.round(rect.left - box.left)}px, ${Math.round(top - 1)}px)`;
      line.current.style.width = `${Math.round(rect.width)}px`;
      line.current.style.opacity = "1";
    };
    const onDrop = (event: DragEvent) => {
      const key = dragging.current;
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      const target = drop.current;
      hideLine();
      if (!target || target.key === key) return;
      editor.update(() => {
        const dragged = $getNodeByKey(key);
        let destination = $getNodeByKey(target.key);
        if (!dragged || !destination) return;
        if ($isElementNode(dragged) && dragged.isParentOf(destination)) return;
        if ($isColumnsNode(dragged))
          destination = destination.getTopLevelElement() ?? destination;
        if (dragged.is(destination)) return;
        if (target.after) destination.insertAfter(dragged);
        else destination.insertBefore(dragged);
      });
    };
    anchor.addEventListener("dragover", onOver, true);
    anchor.addEventListener("drop", onDrop, true);
    anchor.addEventListener("dragleave", hideLine);
    return () => {
      anchor.removeEventListener("dragover", onOver, true);
      anchor.removeEventListener("drop", onDrop, true);
      anchor.removeEventListener("dragleave", hideLine);
    };
  }, [anchor, editable, editor, blockAt]);

  if (!editable) return null;
  const turnInto = blockDefinitions.filter((block) => block.convertible);
  const tones: Record<(typeof calloutTones)[number], string> = {
    neutral: strings.toneNeutral,
    info: strings.toneInfo,
    success: strings.toneSuccess,
    warning: strings.toneWarning,
    danger: strings.toneDanger,
  };
  return (
    <>
      <div
        ref={handle}
        className="absolute top-0 z-10 flex items-center opacity-0 transition-opacity duration-100"
        style={{ width: HANDLE_WIDTH, left: 0 }}
      >
        <Tip label={strings.addBlock}>
          <button
            type="button"
            tabIndex={-1}
            aria-label={strings.addBlock}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              const key = hovered?.key;
              if (!key) return;
              const above = event.altKey;
              updateFromOutside(editor, () => {
                const block = $getNodeByKey(key);
                if (!block) return;
                const paragraph = $createParagraphNode();
                if (above) block.insertBefore(paragraph);
                else block.insertAfter(paragraph);
                paragraph.select();
                const selection = $getSelection();
                if ($isRangeSelection(selection)) selection.insertText("/");
              });
            }}
            className="flex size-6 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </Tip>
        <Menu.Root
          open={menu}
          onOpenChange={(open) => {
            if (!open) setMenu(false);
          }}
        >
          <Tip label={strings.blockHandle} shortcut={shortcutLabel("Mod+/")}>
            <Menu.Trigger
              ref={grip}
              draggable
              tabIndex={-1}
              aria-label={strings.blockHandle}
              onClick={() => {
                if (hovered) openMenu(hovered.key);
              }}
              onDragStart={(event) => {
                if (!hovered) return;
                setMenu(false);
                dragging.current = hovered.key;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(DRAG_TYPE, hovered.key);
                event.dataTransfer.setDragImage(hovered.element, 0, 0);
                hovered.element.classList.add("fe-block-dragging");
              }}
              onDragEnd={() => {
                hovered?.element.classList.remove("fe-block-dragging");
                dragging.current = null;
                if (line.current) line.current.style.opacity = "0";
              }}
              className="flex h-6 w-4.5 cursor-grab items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground active:cursor-grabbing"
            >
              <GripVertical className="size-4" aria-hidden />
            </Menu.Trigger>
          </Tip>
          <Menu.Portal>
            <Menu.Positioner
              anchor={grip}
              side="bottom"
              align="start"
              sideOffset={6}
              className="z-50"
            >
              <Menu.Popup
                className={menuPopupClass}
                finalFocus={textFocus(editor)}
              >
                {facts?.convertible ? (
                  <Menu.SubmenuRoot>
                    <Menu.SubmenuTrigger className={menuItemClass}>
                      <Repeat2 aria-hidden />
                      <span className="flex-1">{strings.turnInto}</span>
                      <ChevronRight className="rtl:-scale-x-100" aria-hidden />
                    </Menu.SubmenuTrigger>
                    <Menu.Portal>
                      <Menu.Positioner className="z-50" sideOffset={4}>
                        <Menu.Popup
                          className={cx(
                            menuPopupClass,
                            "max-h-80 overflow-y-auto",
                          )}
                        >
                          {turnInto.map((block) => (
                            <Menu.Item
                              key={block.type}
                              className={menuItemClass}
                              onClick={() =>
                                act((node) => {
                                  const next = $turnInto(node, block.type);
                                  if ($isElementNode(next)) next.selectEnd();
                                })
                              }
                            >
                              <block.icon aria-hidden />
                              <span className="flex-1">
                                {block.label(strings)}
                              </span>
                              {facts.type === block.type ? (
                                <span className="size-1.5 rounded-full bg-primary" />
                              ) : null}
                            </Menu.Item>
                          ))}
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.SubmenuRoot>
                ) : null}
                {facts?.callout ? (
                  <Menu.SubmenuRoot>
                    <Menu.SubmenuTrigger className={menuItemClass}>
                      <Palette aria-hidden />
                      <span className="flex-1">{strings.tone}</span>
                      <ChevronRight className="rtl:-scale-x-100" aria-hidden />
                    </Menu.SubmenuTrigger>
                    <Menu.Portal>
                      <Menu.Positioner className="z-50" sideOffset={4}>
                        <Menu.Popup className={menuPopupClass}>
                          {calloutTones.map((tone) => (
                            <Menu.Item
                              key={tone}
                              className={menuItemClass}
                              onClick={() =>
                                act((node) => {
                                  if ($isCalloutNode(node)) node.setTone(tone);
                                })
                              }
                            >
                              <span
                                className="fe-tone-swatch size-3 rounded-full"
                                data-tone={tone}
                                aria-hidden
                              />
                              <span className="flex-1">{tones[tone]}</span>
                              {facts.callout === tone ? (
                                <span className="size-1.5 rounded-full bg-primary" />
                              ) : null}
                            </Menu.Item>
                          ))}
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.SubmenuRoot>
                ) : null}
                {facts?.layout ? (
                  <Menu.SubmenuRoot>
                    <Menu.SubmenuTrigger className={menuItemClass}>
                      <Palette aria-hidden />
                      <span className="flex-1">{strings.columnLayout}</span>
                      <ChevronRight className="rtl:-scale-x-100" aria-hidden />
                    </Menu.SubmenuTrigger>
                    <Menu.Portal>
                      <Menu.Positioner className="z-50" sideOffset={4}>
                        <Menu.Popup className={menuPopupClass}>
                          {columnLayouts.map((layout) => (
                            <Menu.Item
                              key={layout}
                              className={menuItemClass}
                              onClick={() =>
                                act((node) => $setLayout(node, layout))
                              }
                            >
                              <span
                                className="flex h-3 w-8 gap-0.5"
                                aria-hidden
                              >
                                {segments(layout).map((segment) => (
                                  <span
                                    key={segment.key}
                                    className="rounded-[2px] bg-muted-foreground/40"
                                    style={{ flexGrow: segment.size }}
                                  />
                                ))}
                              </span>
                              <span className="flex-1" dir="ltr">
                                {layout.replaceAll(":", " : ")}
                              </span>
                              {facts.layout === layout ? (
                                <span className="size-1.5 rounded-full bg-primary" />
                              ) : null}
                            </Menu.Item>
                          ))}
                        </Menu.Popup>
                      </Menu.Positioner>
                    </Menu.Portal>
                  </Menu.SubmenuRoot>
                ) : null}
                {facts?.panels ? (
                  <>
                    <Menu.SubmenuRoot>
                      <Menu.SubmenuTrigger className={menuItemClass}>
                        <LayoutTemplate aria-hidden />
                        <span className="flex-1">{strings.panelLayout}</span>
                        <ChevronRight
                          className="rtl:-scale-x-100"
                          aria-hidden
                        />
                      </Menu.SubmenuTrigger>
                      <Menu.Portal>
                        <Menu.Positioner className="z-50" sideOffset={4}>
                          <Menu.Popup className={menuPopupClass}>
                            {panelLayouts.map((layout) => {
                              const block = blockDefinitions.find(
                                (item) => item.type === layout,
                              );
                              return block ? (
                                <Menu.Item
                                  key={layout}
                                  className={menuItemClass}
                                  onClick={() =>
                                    act((node) => {
                                      if ($isPanelsNode(node))
                                        node.setLayout(layout);
                                    })
                                  }
                                >
                                  <block.icon aria-hidden />
                                  <span className="flex-1">
                                    {block.label(strings)}
                                  </span>
                                  {facts.panels?.layout === layout ? (
                                    <span className="size-1.5 rounded-full bg-primary" />
                                  ) : null}
                                </Menu.Item>
                              ) : null;
                            })}
                          </Menu.Popup>
                        </Menu.Positioner>
                      </Menu.Portal>
                    </Menu.SubmenuRoot>
                    {facts.panels.count < MAX_PANELS ? (
                      <Menu.Item
                        className={menuItemClass}
                        onClick={() =>
                          act((node) => {
                            if (!$isPanelsNode(node)) return;
                            const panel = $createPanel();
                            node.append(panel);
                            panel.getFirstChild<ElementNode>()?.selectStart();
                          })
                        }
                      >
                        <Plus aria-hidden />
                        <span className="flex-1">
                          {
                            {
                              tabs: strings.addTab,
                              steps: strings.addStep,
                              timeline: strings.addEvent,
                              cards: strings.addCard,
                            }[facts.panels.layout]
                          }
                        </span>
                      </Menu.Item>
                    ) : null}
                  </>
                ) : null}
                {facts && facts.narration !== "none" ? (
                  <Menu.Item
                    className={menuItemClass}
                    onClick={() => {
                      const key = hovered?.key;
                      setMenu(false);
                      if (key)
                        // After the menu hands focus back to the text, which
                        // would otherwise close the panel as it opens.
                        requestAnimationFrame(() =>
                          editor.dispatchCommand(OPEN_NARRATION_COMMAND, key),
                        );
                    }}
                  >
                    <Volume2 aria-hidden />
                    <span className="flex-1">{strings.narration}</span>
                    {facts.narration === "recorded" ? (
                      <span className="size-1.5 rounded-full bg-primary" />
                    ) : null}
                  </Menu.Item>
                ) : null}
                <Menu.Item
                  className={menuItemClass}
                  onClick={() => act((node) => $duplicateBlock(node))}
                >
                  <Copy aria-hidden />
                  <span className="flex-1">{strings.duplicate}</span>
                  <kbd className="text-xs text-muted-foreground" dir="ltr">
                    {shortcutLabel("Mod+D")}
                  </kbd>
                </Menu.Item>
                <Menu.Item
                  className={menuItemClass}
                  disabled={facts?.first}
                  onClick={() => act((node) => $moveBlock(node, -1))}
                >
                  <ArrowUp aria-hidden />
                  <span className="flex-1">{strings.moveUp}</span>
                  <kbd className="text-xs text-muted-foreground" dir="ltr">
                    {shortcutLabel("Alt+Shift+↑")}
                  </kbd>
                </Menu.Item>
                <Menu.Item
                  className={menuItemClass}
                  disabled={facts?.last}
                  onClick={() => act((node) => $moveBlock(node, 1))}
                >
                  <ArrowDown aria-hidden />
                  <span className="flex-1">{strings.moveDown}</span>
                  <kbd className="text-xs text-muted-foreground" dir="ltr">
                    {shortcutLabel("Alt+Shift+↓")}
                  </kbd>
                </Menu.Item>
                <Menu.Separator className="-mx-1 my-1 h-px bg-border" />
                <Menu.Item
                  className={cx(
                    menuItemClass,
                    "text-destructive [&_svg]:text-destructive",
                  )}
                  onClick={() => act($removeBlock)}
                >
                  <Trash2 aria-hidden />
                  <span className="flex-1">{strings.delete}</span>
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <div
        ref={line}
        aria-hidden
        className="pointer-events-none absolute top-0 z-10 h-0.5 rounded-full bg-primary/70 opacity-0"
        style={{ left: 0 }}
      />
    </>
  );
}
