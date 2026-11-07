import type { BaseSelection } from "lexical";
import type { ReactNode } from "react";

import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $findTableNode,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
  $isTableCellNode,
} from "@lexical/table";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import {
  Bold,
  Check,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FileDown,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  ListPlus,
  Plus,
  Redo2,
  Repeat2,
  Search,
  Strikethrough,
  Table,
  Underline,
  Undo2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { BlockType } from "../blocks";
import type { MarkFormat } from "../formatting";

import {
  $anchorFor,
  $blockTypeOf,
  $turnInto,
  blockDefinitions,
  blockScope,
} from "../blocks";
import { useEditorEnvironment } from "../context";
import { $activeFormats, OPEN_LINK_EDITOR_COMMAND } from "../formatting";
import { markdownTransformers } from "../markdown";
import { textFocus, updateFromOutside } from "../outside";
import { Tip, ToolButton, cx, menuItemClass, menuPopupClass } from "../ui";
import { FindTool } from "./find";
import { $runBlock } from "./insert";
import { InsertTool } from "./insert-tool";
import { SuggestTool } from "./suggest";
import { $insertTable, TableSizePicker } from "./table-size";

const primaryButton =
  "inline-flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90";
const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-md border px-3.5 text-sm font-medium hover:bg-accent";

interface Tool {
  key: string;
  /** Starts a new group, ruled off from the one before it. */
  group?: boolean;
  inline: ReactNode;
  /** The same tool as an entry of the More menu, once the row has no room. */
  menu: ReactNode;
}

const TOOL_GAP = 2;
const MORE_WIDTH = 32;

/**
 * How many tools fit the row. Each tool's width is kept from when it was last
 * drawn, so tools moved into the menu still count when the row grows again.
 *
 * Widths come from a ResizeObserver, which the browser feeds after its own
 * layout: measuring on each render would force a layout of the whole page,
 * document and all, after every key pressed.
 */
function useFittingTools(count: number) {
  const row = useRef<HTMLFieldSetElement>(null);
  const widths = useRef<number[]>([]);
  const room = useRef(0);
  const watcher = useRef<{
    observer: ResizeObserver;
    watched: WeakSet<Element>;
  } | null>(null);
  const [shown, setShown] = useState(count);
  const fit = useCallback(() => {
    const need = (upTo: number) =>
      widths.current
        .slice(0, upTo)
        .reduce((sum, width) => sum + width + TOOL_GAP, 0);
    let next = count;
    if (need(count) > room.current)
      while (next > 0 && need(next) + MORE_WIDTH > room.current) next -= 1;
    setShown(next);
  }, [count]);
  // The first fit is measured before the row is painted, so it never shows
  // tools it has no room for.
  useLayoutEffect(() => {
    const box = row.current;
    if (!box) return;
    for (const tool of box.querySelectorAll<HTMLElement>("[data-tool]"))
      widths.current[Number(tool.dataset.tool)] = tool.offsetWidth;
    const style = getComputedStyle(box);
    room.current =
      box.clientWidth -
      Number.parseFloat(style.paddingLeft) -
      Number.parseFloat(style.paddingRight);
    fit();
  }, [fit]);
  useEffect(() => {
    const box = row.current;
    if (!box) return undefined;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const tool = (entry.target as HTMLElement).dataset.tool;
        // A tool moved into the menu reports a width of nothing as it
        // leaves; taken as its width, the row would make room for it and
        // drop it again on every frame.
        if (!entry.target.isConnected) observer.unobserve(entry.target);
        else if (entry.target === box) room.current = entry.contentRect.width;
        else if (tool !== undefined)
          widths.current[Number(tool)] =
            entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width;
      }
      fit();
    });
    observer.observe(box);
    watcher.current = { observer, watched: new WeakSet() };
    return () => {
      observer.disconnect();
      watcher.current = null;
    };
  }, [fit]);
  useEffect(() => {
    const current = watcher.current;
    if (!current) return;
    for (const tool of row.current?.querySelectorAll("[data-tool]") ?? [])
      if (!current.watched.has(tool)) {
        current.watched.add(tool);
        current.observer.observe(tool);
      }
  });
  return { row, shown };
}

function ToolSubmenu({
  label,
  icon,
  items,
  onPick,
}: {
  label: string;
  icon: ReactNode;
  items: typeof blockDefinitions;
  onPick: (type: BlockType) => void;
}) {
  const { strings } = useEditorEnvironment();
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger className={menuItemClass}>
        {icon}
        <span className="flex-1">{label}</span>
        <ChevronRight className="rtl:-scale-x-100" aria-hidden />
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50" sideOffset={4}>
          <Menu.Popup
            className={cx(menuPopupClass, "max-h-80 overflow-y-auto")}
            finalFocus={false}
          >
            {items.map((item) => (
              <Menu.Item
                key={item.type}
                className={menuItemClass}
                onClick={() => onPick(item.type)}
              >
                <item.icon aria-hidden />
                <span className="flex-1">{item.label(strings)}</span>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}

function ToolCheck({
  label,
  icon,
  on,
  onToggle,
}: {
  label: string;
  icon: ReactNode;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <Menu.CheckboxItem
      className={menuItemClass}
      checked={on}
      closeOnClick
      onCheckedChange={onToggle}
    >
      {icon}
      <span className="flex-1">{label}</span>
      <Menu.CheckboxItemIndicator>
        <Check aria-hidden />
      </Menu.CheckboxItemIndicator>
    </Menu.CheckboxItem>
  );
}

export function ToolbarPlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();
  const environment = useEditorEnvironment();
  const { strings } = environment;
  const [undo, setUndo] = useState(false);
  const [redo, setRedo] = useState(false);
  const [formats, setFormats] = useState<MarkFormat[]>([]);
  const [block, setBlock] = useState<BlockType | null>(null);
  const [inTable, setInTable] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [markdownOpen, setMarkdownOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [more, setMore] = useState<HTMLElement | null>(null);
  const saved = useRef<BaseSelection | null>(null);

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          CAN_UNDO_COMMAND,
          (value) => {
            setUndo(value);
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          CAN_REDO_COMMAND,
          (value) => {
            setRedo(value);
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
        // The key, not the letter, so an Arabic keyboard finds too.
        editor.registerCommand(
          KEY_DOWN_COMMAND,
          (event) => {
            if (
              !(event.metaKey || event.ctrlKey) ||
              event.altKey ||
              event.shiftKey ||
              event.code !== "KeyF"
            )
              return false;
            event.preventDefault();
            setFindOpen(true);
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerUpdateListener(({ editorState }) =>
          editorState.read(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            // A new list on every key pressed would draw the whole row again.
            const next = $activeFormats();
            setFormats((current) =>
              current.length === next.length &&
              current.every((format, index) => format === next[index])
                ? current
                : next,
            );
            setBlock($blockTypeOf($anchorFor("paragraph")));
            setInTable(
              Boolean(
                $findMatchingParent(
                  selection.anchor.getNode(),
                  $isTableCellNode,
                ),
              ),
            );
          }),
        ),
      ),
    [editor],
  );

  const remember = () => {
    saved.current = editor
      .getEditorState()
      .read(() => $getSelection()?.clone() ?? null);
  };
  // The caret is kept as the picker opens, for the block to land there.
  const openInsert = (next: boolean) => {
    if (next) remember();
    setInsertOpen(next);
  };
  // With no caret yet, a block goes at the end of the document on a line of
  // its own, which a document ending in a block such as a bibliography
  // would otherwise leave it nowhere to stand.
  const insertBlock = (type: BlockType) =>
    restore(() => {
      if (!saved.current) {
        const end = $createParagraphNode();
        $getRoot().append(end);
        end.select();
      }
      $runBlock(editor, type);
    });
  const restore = (change: () => void) =>
    updateFromOutside(editor, () => {
      if (saved.current) $setSelection(saved.current.clone());
      else $getRoot().selectEnd();
      change();
    });

  const marks: { format: MarkFormat; label: string; icon: typeof Bold }[] = [
    { format: "bold", label: strings.bold, icon: Bold },
    { format: "italic", label: strings.italic, icon: Italic },
    { format: "underline", label: strings.underline, icon: Underline },
    {
      format: "strikethrough",
      label: strings.strikethrough,
      icon: Strikethrough,
    },
  ];
  const lists: { type: BlockType; label: string; icon: typeof List }[] = [
    { type: "bullet", label: strings.bulletList, icon: List },
    { type: "number", label: strings.numberedList, icon: ListOrdered },
    { type: "check", label: strings.checklist, icon: ListChecks },
  ];
  const current = blockDefinitions.find((item) => item.type === block);
  const turnInto = blockDefinitions.filter((item) => item.convertible);
  const scope = blockScope(environment);
  const turn = (type: BlockType) =>
    restore(() => {
      const target = $anchorFor(type);
      if (target) $turnInto(target, type);
    });
  const toggleList = (type: BlockType) =>
    editor.update(() => {
      const target = $anchorFor(type);
      if (target) $turnInto(target, block === type ? "paragraph" : type);
    });
  const tools: Tool[] = [
    {
      key: "undo",
      inline: (
        <ToolButton
          label={strings.undo}
          disabled={!undo}
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        >
          <Undo2 aria-hidden />
        </ToolButton>
      ),
      menu: (
        <Menu.Item
          className={menuItemClass}
          disabled={!undo}
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        >
          <Undo2 aria-hidden />
          {strings.undo}
        </Menu.Item>
      ),
    },
    {
      key: "redo",
      inline: (
        <ToolButton
          label={strings.redo}
          disabled={!redo}
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        >
          <Redo2 aria-hidden />
        </ToolButton>
      ),
      menu: (
        <Menu.Item
          className={menuItemClass}
          disabled={!redo}
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        >
          <Redo2 aria-hidden />
          {strings.redo}
        </Menu.Item>
      ),
    },
    {
      key: "block",
      group: true,
      inline: (
        <Menu.Root
          onOpenChange={(open) => {
            if (open) remember();
          }}
        >
          <Menu.Trigger
            aria-label={strings.turnInto}
            className="inline-flex h-8 min-w-28 items-center justify-between gap-1 rounded-md px-2 text-sm text-foreground/80 hover:bg-accent hover:text-foreground"
          >
            <span className="truncate">
              {current?.label(strings) ?? strings.text}
            </span>
            <ChevronDown className="size-3.5 opacity-60" aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className="z-50" sideOffset={6} align="start">
              <Menu.Popup
                className={cx(menuPopupClass, "max-h-80 overflow-y-auto")}
                finalFocus={textFocus(editor)}
              >
                {turnInto.map((item) => (
                  <Menu.Item
                    key={item.type}
                    className={menuItemClass}
                    onClick={() => turn(item.type)}
                  >
                    <item.icon aria-hidden />
                    <span className="flex-1">{item.label(strings)}</span>
                    {item.shortcut ? (
                      <kbd
                        className="font-mono text-xs text-muted-foreground"
                        dir="ltr"
                      >
                        {item.shortcut}
                      </kbd>
                    ) : null}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ),
      menu: (
        <ToolSubmenu
          label={strings.turnInto}
          icon={<Repeat2 aria-hidden />}
          items={turnInto}
          onPick={turn}
        />
      ),
    },
    ...marks.map((mark, index): Tool => ({
      key: mark.format,
      group: index === 0,
      inline: (
        <ToolButton
          label={mark.label}
          active={formats.includes(mark.format)}
          onClick={() =>
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, mark.format)
          }
        >
          <mark.icon aria-hidden />
        </ToolButton>
      ),
      menu: (
        <ToolCheck
          label={mark.label}
          icon={<mark.icon aria-hidden />}
          on={formats.includes(mark.format)}
          onToggle={() =>
            restore(() => {
              const selection = $getSelection();
              if ($isRangeSelection(selection))
                selection.formatText(mark.format);
            })
          }
        />
      ),
    })),
    {
      key: "link",
      inline: (
        <ToolButton
          label={strings.link}
          onClick={() =>
            editor.dispatchCommand(OPEN_LINK_EDITOR_COMMAND, undefined)
          }
        >
          <Link aria-hidden />
        </ToolButton>
      ),
      menu: (
        <Menu.Item
          className={menuItemClass}
          onClick={() => {
            restore(() => {});
            requestAnimationFrame(() =>
              editor.dispatchCommand(OPEN_LINK_EDITOR_COMMAND, undefined),
            );
          }}
        >
          <Link aria-hidden />
          {strings.link}
        </Menu.Item>
      ),
    },
    ...lists.map((item, index): Tool => ({
      key: item.type,
      group: index === 0,
      inline: (
        <ToolButton
          label={item.label}
          active={block === item.type}
          onClick={() => toggleList(item.type)}
        >
          <item.icon aria-hidden />
        </ToolButton>
      ),
      menu: (
        <ToolCheck
          label={item.label}
          icon={<item.icon aria-hidden />}
          on={block === item.type}
          onToggle={() =>
            restore(() => {
              const target = $anchorFor(item.type);
              if (target)
                $turnInto(
                  target,
                  block === item.type ? "paragraph" : item.type,
                );
            })
          }
        />
      ),
    })),
    {
      key: "insert",
      group: true,
      inline: (
        <InsertTool
          scope={scope}
          open={insertOpen}
          onOpenChange={openInsert}
          onPick={insertBlock}
        />
      ),
      menu: (
        <Menu.Item className={menuItemClass} onClick={() => openInsert(true)}>
          <Plus aria-hidden />
          {strings.insert}
        </Menu.Item>
      ),
    },
    {
      key: "table",
      inline: (
        <TableTools
          inTable={inTable}
          open={tableOpen}
          onOpenChange={setTableOpen}
          onOpen={remember}
          restore={restore}
        />
      ),
      menu: (
        <Menu.Item className={menuItemClass} onClick={() => setTableOpen(true)}>
          <Table aria-hidden />
          {strings.tableTools}
        </Menu.Item>
      ),
    },
    ...(environment.questions
      ? [
          {
            key: "suggest",
            inline: (
              <SuggestTool open={suggestOpen} onOpenChange={setSuggestOpen} />
            ),
            menu: (
              <Menu.Item
                className={menuItemClass}
                onClick={() => setSuggestOpen(true)}
              >
                <ListPlus aria-hidden />
                {strings.suggestTitle}
              </Menu.Item>
            ),
          },
        ]
      : []),
    {
      key: "find",
      group: true,
      inline: <FindTool open={findOpen} onOpenChange={setFindOpen} />,
      menu: (
        <Menu.Item className={menuItemClass} onClick={() => setFindOpen(true)}>
          <Search aria-hidden />
          {strings.findReplace}
        </Menu.Item>
      ),
    },
    {
      key: "markdown",
      inline: (
        <MarkdownDialog open={markdownOpen} onOpenChange={setMarkdownOpen} />
      ),
      menu: (
        <Menu.Item
          className={menuItemClass}
          onClick={() => setMarkdownOpen(true)}
        >
          <FileDown aria-hidden />
          {strings.markdown}
        </Menu.Item>
      ),
    },
  ];
  const { row, shown } = useFittingTools(tools.length);
  const hidden = tools.slice(shown);
  const findHidden = hidden.some((tool) => tool.key === "find");
  const insertHidden = hidden.some((tool) => tool.key === "insert");
  const tableHidden = hidden.some((tool) => tool.key === "table");
  const suggestHidden = hidden.some((tool) => tool.key === "suggest");
  const markdownHidden = hidden.some((tool) => tool.key === "markdown");

  return (
    <fieldset
      ref={row}
      disabled={disabled}
      aria-label={strings.formatting}
      className="flex min-w-0 items-center gap-0.5 overflow-hidden bg-muted/25 px-1.5 py-1"
    >
      {tools.slice(0, shown).map((tool, index) => (
        <div
          key={tool.key}
          data-tool={index}
          className="flex shrink-0 items-center"
        >
          {tool.group ? (
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          ) : null}
          {tool.inline}
        </div>
      ))}
      {hidden.length > 0 ? (
        <Menu.Root
          onOpenChange={(open) => {
            if (open) remember();
          }}
        >
          <Tip label={strings.moreTools}>
            <Menu.Trigger
              ref={(node: HTMLElement | null) => setMore(node)}
              aria-label={strings.moreTools}
              className="ms-auto inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground data-popup-open:bg-accent [&_svg]:size-4"
            >
              <Ellipsis aria-hidden />
            </Menu.Trigger>
          </Tip>
          <Menu.Portal>
            <Menu.Positioner className="z-50" sideOffset={6} align="end">
              <Menu.Popup
                className={cx(menuPopupClass, "max-h-96 w-60 overflow-y-auto")}
                finalFocus={textFocus(editor)}
              >
                {hidden.map((tool, index) => (
                  <div key={tool.key} className="contents">
                    {tool.group && index > 0 ? (
                      <Menu.Separator className="-mx-1 my-1 h-px bg-border" />
                    ) : null}
                    {tool.menu}
                  </div>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ) : null}
      {tableHidden ? (
        <TableTools
          inTable={inTable}
          open={tableOpen}
          onOpenChange={setTableOpen}
          onOpen={remember}
          restore={restore}
          anchor={more}
        />
      ) : null}
      {suggestHidden ? (
        <SuggestTool
          open={suggestOpen}
          onOpenChange={setSuggestOpen}
          anchor={more}
        />
      ) : null}
      {findHidden ? (
        <FindTool open={findOpen} onOpenChange={setFindOpen} anchor={more} />
      ) : null}
      {insertHidden ? (
        <InsertTool
          scope={scope}
          open={insertOpen}
          onOpenChange={openInsert}
          onPick={insertBlock}
          anchor={more}
        />
      ) : null}
      {markdownHidden ? (
        <MarkdownDialog
          open={markdownOpen}
          onOpenChange={setMarkdownOpen}
          trigger={false}
        />
      ) : null}
    </fieldset>
  );
}

function TableTools({
  inTable,
  open,
  onOpenChange: setOpen,
  onOpen,
  restore,
  anchor,
}: {
  inTable: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpen: () => void;
  restore: (change: () => void) => void;
  /** Where the panel opens from when its own button is in the More menu. */
  anchor?: HTMLElement | null;
}) {
  const { strings } = useEditorEnvironment();
  const operations = [
    { label: strings.addRow, run: () => $insertTableRowAtSelection(true) },
    {
      label: strings.addColumn,
      run: () => $insertTableColumnAtSelection(true),
    },
    { label: strings.deleteRow, run: () => $deleteTableRowAtSelection() },
    { label: strings.deleteColumn, run: () => $deleteTableColumnAtSelection() },
    {
      label: strings.deleteTable,
      run: () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const cell = $findMatchingParent(
          selection.anchor.getNode(),
          $isTableCellNode,
        );
        const table = cell ? $findTableNode(cell) : null;
        table?.remove();
      },
    },
  ];
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) onOpen();
        setOpen(next);
      }}
    >
      {anchor === undefined ? (
        <Tip label={strings.tableTools}>
          <Popover.Trigger
            aria-label={strings.tableTools}
            className="inline-flex size-8 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4"
          >
            <Table aria-hidden />
          </Popover.Trigger>
        </Tip>
      ) : null}
      <Popover.Portal>
        <Popover.Positioner
          className="z-50"
          sideOffset={6}
          align={anchor === undefined ? "start" : "end"}
          anchor={anchor}
        >
          <Popover.Popup
            data-editor-prompt=""
            className="max-w-[calc(100vw-1rem)] min-w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg outline-none"
          >
            <Popover.Title className="mb-2 text-sm font-semibold">
              {strings.tableTools}
            </Popover.Title>
            {inTable ? (
              <div className="grid gap-0.5">
                {operations.map((operation) => (
                  <button
                    key={operation.label}
                    type="button"
                    className={cx(menuItemClass, "hover:bg-accent")}
                    onClick={() => {
                      setOpen(false);
                      restore(operation.run);
                    }}
                  >
                    {operation.label}
                  </button>
                ))}
              </div>
            ) : (
              <TableSizePicker
                strings={strings}
                onCancel={() => setOpen(false)}
                onInsert={(size) => {
                  setOpen(false);
                  restore(() => {
                    $insertTable(size);
                  });
                }}
              />
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MarkdownDialog({
  open,
  onOpenChange: setOpen,
  trigger = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const [markdown, setMarkdown] = useState("");
  const id = useId();
  // Opening from the More menu sets `open` without going through the root.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open)
      setMarkdown(
        editor
          .getEditorState()
          .read(() => $convertToMarkdownString(markdownTransformers)),
      );
  }
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {trigger ? (
        <Tip label={strings.markdown}>
          <Dialog.Trigger
            aria-label={strings.markdown}
            className="inline-flex size-8 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4"
          >
            <FileDown aria-hidden />
          </Dialog.Trigger>
        </Tip>
      ) : null}
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed start-1/2 top-1/2 z-50 grid w-[min(40rem,calc(100vw-2rem))] -translate-y-1/2 gap-4 rounded-xl border bg-background p-5 shadow-xl outline-none ltr:-translate-x-1/2 rtl:translate-x-1/2">
          <div className="grid gap-1">
            <Dialog.Title className="text-base font-semibold">
              {strings.markdown}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              {strings.markdownHint}
            </Dialog.Description>
          </div>
          <textarea
            id={`${id}-markdown`}
            aria-label={strings.markdown}
            dir="auto"
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            className="min-h-64 w-full resize-y rounded-md border bg-background p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <div className="flex justify-end gap-2">
            <Dialog.Close className={secondaryButton}>
              {strings.cancel}
            </Dialog.Close>
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                setOpen(false);
                updateFromOutside(editor, () =>
                  $convertFromMarkdownString(markdown, markdownTransformers),
                );
              }}
            >
              {strings.replaceFromMarkdown}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
