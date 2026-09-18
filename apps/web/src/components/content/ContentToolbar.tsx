import type { BaseSelection, TextFormatType } from "lexical";

import { isSafeContentUrl } from "@faridalms/domain/rich-text";
import { $createCodeNode, $isCodeNode } from "@lexical/code";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/extension";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $patchStyleText, $setBlocksType } from "@lexical/selection";
import {
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
  $isTableCellNode,
  INSERT_TABLE_COMMAND,
} from "@lexical/table";
import { mergeRegister, $findMatchingParent } from "@lexical/utils";
import {
  $createParagraphNode,
  $getSelection,
  $getRoot,
  $isRangeSelection,
  $setSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Redo2,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ManagementInput } from "~/components/admin/ManagementDialog";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "~/components/app/dialog";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";

import { contentMarkdownTransformers } from "./markdown";

export function ContentToolbar({ disabled }: { disabled?: boolean }) {
  const [editor] = useLexicalComposerContext();
  const [inTable, setInTable] = useState(false);
  const [undo, setUndo] = useState(false);
  const [redo, setRedo] = useState(false);
  const [active, setActive] = useState<TextFormatType[]>([]);
  const [dialog, setDialog] = useState<"link" | "table" | "markdown" | null>(
    null,
  );
  const [url, setUrl] = useState("");
  const [rows, setRows] = useState("3");
  const [columns, setColumns] = useState("3");
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState("");
  const selection = useRef<BaseSelection | null>(null);
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
            const current = $getSelection();
            setInTable(
              $isRangeSelection(current) &&
                Boolean(
                  $findMatchingParent(
                    current.anchor.getNode(),
                    $isTableCellNode,
                  ),
                ),
            );
            if ($isRangeSelection(current))
              setActive(
                (
                  [
                    "bold",
                    "italic",
                    "underline",
                    "strikethrough",
                    "code",
                    "subscript",
                    "superscript",
                  ] as const
                ).filter((format) => current.hasFormat(format)),
              );
          }),
        ),
      ),
    [editor],
  );
  const open = (value: NonNullable<typeof dialog>) => {
    editor.getEditorState().read(() => {
      selection.current = $getSelection()?.clone() ?? null;
      if (value === "markdown")
        setMarkdown($convertToMarkdownString(contentMarkdownTransformers));
    });
    setError("");
    setDialog(value);
  };
  const apply = (operation: () => void) => {
    editor.update(() => {
      if (selection.current) $setSelection(selection.current.clone());
      else $getRoot().selectEnd();
      operation();
    });
    setDialog(null);
    editor.focus();
  };
  const formats = [
    { format: "bold", icon: Bold, label: m.markdownBold() },
    { format: "italic", icon: Italic, label: m.markdownItalic() },
    { format: "underline", icon: Underline, label: m.contentUnderline() },
    { format: "strikethrough", icon: Strikethrough, label: m.markdownStrike() },
    { format: "code", icon: Code, label: m.contentInlineCode() },
    { format: "subscript", icon: Subscript, label: m.contentSubscript() },
    { format: "superscript", icon: Superscript, label: m.contentSuperscript() },
  ] as const;
  const blocks = [
    { value: "paragraph", label: m.contentParagraph() },
    { value: "h1", label: m.contentHeading1() },
    { value: "h2", label: m.contentHeading2() },
    { value: "h3", label: m.contentHeading3() },
    { value: "quote", label: m.markdownQuote() },
    { value: "code", label: m.contentCodeBlock() },
  ];
  return (
    <>
      <fieldset
        disabled={disabled}
        aria-label={m.contentFormatting()}
        className="flex flex-wrap items-center gap-1 border-b bg-muted/30 p-2"
      >
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={!undo}
          aria-label={m.contentUndo()}
          onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        >
          <Undo2 aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={!redo}
          aria-label={m.contentRedo()}
          onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        >
          <Redo2 aria-hidden />
        </Button>
        <Select<string>
          items={blocks}
          value={null}
          onValueChange={(value) => {
            editor.update(() => {
              const current = $getSelection();
              if ($isRangeSelection(current))
                $setBlocksType(current, () =>
                  value === "h1" || value === "h2" || value === "h3"
                    ? $createHeadingNode(value)
                    : value === "quote"
                      ? $createQuoteNode()
                      : value === "code"
                        ? $createCodeNode()
                        : $createParagraphNode(),
                );
            });
            editor.focus();
          }}
        >
          <SelectTrigger
            aria-label={m.contentBlockStyle()}
            className="min-w-32"
          >
            <SelectValue placeholder={m.contentBlockStyle()} />
          </SelectTrigger>
          <SelectContent>
            {blocks.map((block) => (
              <SelectItem key={block.value} value={block.value}>
                {block.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {formats.map((item) => (
          <Button
            key={item.format}
            type="button"
            variant={active.includes(item.format) ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label={item.label}
            aria-pressed={active.includes(item.format)}
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, item.format)
            }
          >
            <item.icon aria-hidden />
          </Button>
        ))}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={m.contentHighlight()}
          onClick={() =>
            editor.update(() => {
              const current = $getSelection();
              if ($isRangeSelection(current))
                $patchStyleText(current, {
                  "background-color": "#fef08a",
                  color: "#111827",
                });
            })
          }
        >
          <Highlighter aria-hidden />
        </Button>
        <span className="mx-1 h-5 border-s" />
        {[
          {
            icon: List,
            label: m.markdownList(),
            command: INSERT_UNORDERED_LIST_COMMAND,
          },
          {
            icon: ListOrdered,
            label: m.markdownOrderedList(),
            command: INSERT_ORDERED_LIST_COMMAND,
          },
          {
            icon: ListChecks,
            label: m.contentChecklist(),
            command: INSERT_CHECK_LIST_COMMAND,
          },
        ].map((item) => (
          <Button
            key={item.label}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={item.label}
            onClick={() => editor.dispatchCommand(item.command, undefined)}
          >
            <item.icon aria-hidden />
          </Button>
        ))}
        {[
          { icon: AlignLeft, value: "start", label: m.contentAlignStart() },
          { icon: AlignCenter, value: "center", label: m.contentAlignCenter() },
          { icon: AlignRight, value: "end", label: m.contentAlignEnd() },
          {
            icon: AlignJustify,
            value: "justify",
            label: m.contentAlignJustify(),
          },
        ].map((item) => (
          <Button
            key={item.value}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={item.label}
            onClick={() =>
              editor.dispatchCommand(
                FORMAT_ELEMENT_COMMAND,
                item.value === "start"
                  ? "start"
                  : item.value === "end"
                    ? "end"
                    : item.value === "center"
                      ? "center"
                      : "justify",
              )
            }
          >
            <item.icon className="rtl:-scale-x-100" aria-hidden />
          </Button>
        ))}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={m.contentIndent()}
          onClick={() =>
            editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined)
          }
        >
          <IndentIncrease aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={m.contentOutdent()}
          onClick={() =>
            editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined)
          }
        >
          <IndentDecrease aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={m.contentInsertLink()}
          onClick={() => open("link")}
        >
          <Link aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={m.contentInsertTable()}
          onClick={() => open("table")}
        >
          <Table aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={m.contentDivider()}
          onClick={() =>
            editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
          }
        >
          <Minus aria-hidden />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => open("markdown")}
        >
          {m.contentMarkdown()}
        </Button>
      </fieldset>
      <Dialog
        open={dialog !== null}
        onOpenChange={(value) => {
          if (!value) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {dialog === "link"
              ? m.contentInsertLink()
              : dialog === "table"
                ? m.contentInsertTable()
                : m.contentMarkdown()}
          </DialogTitle>
          <DialogDescription>
            {dialog === "markdown"
              ? m.contentMarkdownReplaceHint()
              : m.contentInsertHint()}
          </DialogDescription>
          {dialog === "link" ? (
            <ManagementInput
              label={m.contentLinkUrl()}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          ) : null}
          {dialog === "table" && !inTable ? (
            <div className="grid grid-cols-2 gap-4">
              <ManagementInput
                type="number"
                min={1}
                max={50}
                label={m.contentRows()}
                value={rows}
                onChange={(event) => setRows(event.target.value)}
              />
              <ManagementInput
                type="number"
                min={1}
                max={20}
                label={m.contentColumns()}
                value={columns}
                onChange={(event) => setColumns(event.target.value)}
              />
            </div>
          ) : null}
          {dialog === "markdown" ? (
            <Textarea
              aria-label={m.contentMarkdown()}
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              className="min-h-64 font-mono"
            />
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {dialog === "table" && inTable ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!inTable}
                  onClick={() =>
                    apply(() => {
                      $insertTableRowAtSelection();
                    })
                  }
                >
                  {m.contentAddRow()}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!inTable}
                  onClick={() =>
                    apply(() => {
                      $insertTableColumnAtSelection();
                    })
                  }
                >
                  {m.contentAddColumn()}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!inTable}
                  onClick={() =>
                    apply(() => {
                      $deleteTableRowAtSelection();
                    })
                  }
                >
                  {m.contentDeleteRow()}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!inTable}
                  onClick={() =>
                    apply(() => {
                      $deleteTableColumnAtSelection();
                    })
                  }
                >
                  {m.contentDeleteColumn()}
                </Button>
              </>
            ) : null}
            {dialog === "link" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  apply(() => {
                    editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
                  })
                }
              >
                {m.contentRemoveLink()}
              </Button>
            ) : null}
            {dialog === "table" && inTable ? null : (
              <Button
                type="button"
                onClick={() => {
                  if (dialog === "link") {
                    if (!isSafeContentUrl(url)) {
                      setError(m.contentInvalidUrl());
                      return;
                    }
                    apply(() => {
                      editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
                    });
                  } else if (dialog === "table") {
                    if (
                      !Number.isInteger(Number(rows)) ||
                      !Number.isInteger(Number(columns)) ||
                      Number(rows) < 1 ||
                      Number(rows) > 50 ||
                      Number(columns) < 1 ||
                      Number(columns) > 20
                    ) {
                      setError(m.contentInvalidTable());
                      return;
                    }
                    apply(() => {
                      const current = $getSelection();
                      if ($isRangeSelection(current) && current.isCollapsed()) {
                        const block = current.anchor
                          .getNode()
                          .getTopLevelElement();
                        if ($isCodeNode(block)) {
                          const paragraph = $createParagraphNode();
                          block.insertAfter(paragraph);
                          paragraph.select();
                        }
                      }
                      editor.dispatchCommand(INSERT_TABLE_COMMAND, {
                        rows,
                        columns,
                        includeHeaders: true,
                      });
                    });
                  } else
                    apply(() => {
                      $convertFromMarkdownString(
                        markdown,
                        contentMarkdownTransformers,
                      );
                    });
                }}
              >
                {dialog === "markdown"
                  ? m.contentReplaceMarkdown()
                  : m.contentInsert()}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
