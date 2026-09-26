import type { BaseSelection } from "lexical";

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
  INSERT_TABLE_COMMAND,
} from "@lexical/table";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import {
  Bold,
  ChevronDown,
  FileDown,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Plus,
  Redo2,
  Strikethrough,
  Table,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { BlockType } from "../blocks";
import type { MarkFormat } from "../formatting";

import {
  $anchorFor,
  $blockTypeOf,
  $turnInto,
  blockDefinitions,
} from "../blocks";
import { useEditorEnvironment } from "../context";
import { $activeFormats, OPEN_LINK_EDITOR_COMMAND } from "../formatting";
import { markdownTransformers } from "../markdown";
import { Tip, ToolButton, cx, menuItemClass, menuPopupClass } from "../ui";
import { $runBlock } from "./insert";

const inputClass =
  "h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive";
const primaryButton =
  "inline-flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90";
const secondaryButton =
  "inline-flex h-9 items-center justify-center rounded-md border px-3.5 text-sm font-medium hover:bg-accent";

export function ToolbarPlugin({ disabled }: { disabled: boolean }) {
  const [editor] = useLexicalComposerContext();
  const { strings, media } = useEditorEnvironment();
  const [undo, setUndo] = useState(false);
  const [redo, setRedo] = useState(false);
  const [formats, setFormats] = useState<MarkFormat[]>([]);
  const [block, setBlock] = useState<BlockType | null>(null);
  const [inTable, setInTable] = useState(false);
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
        editor.registerUpdateListener(({ editorState }) =>
          editorState.read(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) return;
            setFormats($activeFormats());
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
  const restore = (change: () => void) => {
    editor.update(() => {
      if (saved.current) $setSelection(saved.current.clone());
      else $getRoot().selectEnd();
      change();
    });
    editor.focus();
  };

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

  return (
    <fieldset
      disabled={disabled}
      aria-label={strings.formatting}
      className="flex [scrollbar-width:none] items-center gap-0.5 overflow-x-auto border-b bg-muted/25 px-1.5 py-1 sm:flex-wrap sm:overflow-visible"
    >
      <ToolButton
        label={strings.undo}
        disabled={!undo}
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
      >
        <Undo2 aria-hidden />
      </ToolButton>
      <ToolButton
        label={strings.redo}
        disabled={!redo}
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
      >
        <Redo2 aria-hidden />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
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
            >
              {blockDefinitions
                .filter((item) => item.convertible)
                .map((item) => (
                  <Menu.Item
                    key={item.type}
                    className={menuItemClass}
                    onClick={() =>
                      restore(() => {
                        const target = $anchorFor(item.type);
                        if (target) $turnInto(target, item.type);
                      })
                    }
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
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      {marks.map((mark) => (
        <ToolButton
          key={mark.format}
          label={mark.label}
          active={formats.includes(mark.format)}
          onClick={() =>
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, mark.format)
          }
        >
          <mark.icon aria-hidden />
        </ToolButton>
      ))}
      <ToolButton
        label={strings.link}
        onClick={() =>
          editor.dispatchCommand(OPEN_LINK_EDITOR_COMMAND, undefined)
        }
      >
        <Link aria-hidden />
      </ToolButton>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      {lists.map((item) => (
        <ToolButton
          key={item.type}
          label={item.label}
          active={block === item.type}
          onClick={() =>
            editor.update(() => {
              const target = $anchorFor(item.type);
              if (target)
                $turnInto(
                  target,
                  block === item.type ? "paragraph" : item.type,
                );
            })
          }
        >
          <item.icon aria-hidden />
        </ToolButton>
      ))}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <Menu.Root
        onOpenChange={(open) => {
          if (open) remember();
        }}
      >
        <Menu.Trigger className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-foreground/80 hover:bg-accent hover:text-foreground">
          <Plus className="size-4" aria-hidden />
          {strings.insert}
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="z-50" sideOffset={6} align="start">
            <Menu.Popup
              className={cx(menuPopupClass, "max-h-96 w-64 overflow-y-auto")}
            >
              {blockDefinitions
                .filter((item) => (media ? true : !item.media))
                .map((item) => (
                  <Menu.Item
                    key={item.type}
                    className={menuItemClass}
                    onClick={() => restore(() => $runBlock(editor, item.type))}
                  >
                    <item.icon aria-hidden />
                    <span className="flex-1">{item.label(strings)}</span>
                  </Menu.Item>
                ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <TableTools inTable={inTable} onOpen={remember} restore={restore} />
      <MarkdownDialog />
    </fieldset>
  );
}

function TableTools({
  inTable,
  onOpen,
  restore,
}: {
  inTable: boolean;
  onOpen: () => void;
  restore: (change: () => void) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState("3");
  const [columns, setColumns] = useState("3");
  const [invalid, setInvalid] = useState(false);
  const id = useId();
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
        if (next) {
          onOpen();
          setInvalid(false);
        }
        setOpen(next);
      }}
    >
      <Tip label={strings.tableTools}>
        <Popover.Trigger
          aria-label={strings.tableTools}
          className="inline-flex size-8 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4"
        >
          <Table aria-hidden />
        </Popover.Trigger>
      </Tip>
      <Popover.Portal>
        <Popover.Positioner className="z-50" sideOffset={6} align="start">
          <Popover.Popup className="w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg outline-none">
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
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const r = Number(rows);
                  const c = Number(columns);
                  if (
                    !Number.isInteger(r) ||
                    !Number.isInteger(c) ||
                    r < 1 ||
                    c < 1 ||
                    r > 50 ||
                    c > 20
                  ) {
                    setInvalid(true);
                    return;
                  }
                  setOpen(false);
                  restore(() => {
                    const target = $anchorFor("table");
                    if (target) target.selectEnd();
                  });
                  editor.dispatchCommand(INSERT_TABLE_COMMAND, {
                    rows: String(r),
                    columns: String(c),
                    includeHeaders: { rows: true, columns: false },
                  });
                }}
              >
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className="grid gap-1 text-xs font-medium"
                    htmlFor={`${id}-rows`}
                  >
                    {strings.tableRows}
                    <input
                      id={`${id}-rows`}
                      type="number"
                      min={1}
                      max={50}
                      value={rows}
                      aria-invalid={invalid}
                      onChange={(event) => setRows(event.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <label
                    className="grid gap-1 text-xs font-medium"
                    htmlFor={`${id}-columns`}
                  >
                    {strings.tableColumns}
                    <input
                      id={`${id}-columns`}
                      type="number"
                      min={1}
                      max={20}
                      value={columns}
                      aria-invalid={invalid}
                      onChange={(event) => setColumns(event.target.value)}
                      className={inputClass}
                    />
                  </label>
                </div>
                {invalid ? (
                  <p role="alert" className="text-xs text-destructive">
                    {strings.tableInvalid}
                  </p>
                ) : null}
                <button type="submit" className={primaryButton}>
                  {strings.tableApply}
                </button>
              </form>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MarkdownDialog() {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const [open, setOpen] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const id = useId();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next)
          setMarkdown(
            editor
              .getEditorState()
              .read(() => $convertToMarkdownString(markdownTransformers)),
          );
        setOpen(next);
      }}
    >
      <Tip label={strings.markdown}>
        <Dialog.Trigger
          aria-label={strings.markdown}
          className="inline-flex size-8 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground [&_svg]:size-4"
        >
          <FileDown aria-hidden />
        </Dialog.Trigger>
      </Tip>
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
                editor.update(() =>
                  $convertFromMarkdownString(markdown, markdownTransformers),
                );
                setOpen(false);
                editor.focus();
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
