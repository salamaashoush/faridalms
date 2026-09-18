import { useHydrated } from "@tanstack/react-router";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Code,
  Link,
  Table,
} from "lucide-react";
import { useRef } from "react";

import { Button } from "~/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";

import { MarkdownContent } from "./MarkdownContent";

export function MarkdownComposer({
  id,
  name,
  value,
  onChange,
  onBlur,
  invalid,
  describedBy,
  disabled = false,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const hydrated = useHydrated();
  const insert = (before: string, after = "", multiline = false) => {
    const element = textarea.current;
    if (!element) return;
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const selected = value.slice(start, end) || m.markdownSelectedText();
    const replacement = multiline
      ? selected
          .split("\n")
          .map((line) => before + line)
          .join("\n")
      : before + selected + after;
    onChange(value.slice(0, start) + replacement + value.slice(end));
    requestAnimationFrame(() => {
      element.focus();
      element.setSelectionRange(
        start + before.length,
        start + replacement.length - after.length,
      );
    });
  };
  const tools = [
    { icon: Bold, label: m.markdownBold(), before: "**", after: "**" },
    { icon: Italic, label: m.markdownItalic(), before: "_", after: "_" },
    {
      icon: Strikethrough,
      label: m.markdownStrike(),
      before: "~~",
      after: "~~",
    },
    {
      icon: Heading2,
      label: m.markdownHeading(),
      before: "## ",
      multiline: true,
    },
    { icon: List, label: m.markdownList(), before: "- ", multiline: true },
    {
      icon: ListOrdered,
      label: m.markdownOrderedList(),
      before: "1. ",
      multiline: true,
    },
    {
      icon: ListChecks,
      label: m.markdownTasks(),
      before: "- [ ] ",
      multiline: true,
    },
    { icon: Quote, label: m.markdownQuote(), before: "> ", multiline: true },
    { icon: Code, label: m.markdownCode(), before: "`", after: "`" },
    { icon: Link, label: m.markdownLink(), before: "[", after: "](https://)" },
    {
      icon: Table,
      label: m.markdownTable(),
      before: "\n| ",
      after: " |\n| --- |\n|  |\n",
    },
  ];
  return (
    <Tabs
      defaultValue="write"
      className="gap-0 overflow-hidden rounded-xl border bg-background"
    >
      <div className="flex items-center justify-between border-b bg-muted/40 p-2">
        <TabsList>
          <TabsTrigger value="write">{m.markdownWrite()}</TabsTrigger>
          <TabsTrigger value="preview">{m.markdownPreview()}</TabsTrigger>
        </TabsList>
        <span className="px-2 text-xs text-muted-foreground">
          {m.markdownSupported()}
        </span>
      </div>
      <TabsContent value="write" className="mt-0">
        <fieldset
          aria-label={m.markdownFormatting()}
          className="flex flex-wrap gap-1 border-b p-2"
        >
          {tools.map(({ icon: Icon, label, before, after, multiline }) => (
            <Button
              key={label}
              type="button"
              variant="ghost"
              size="icon-sm"
              title={label}
              aria-label={label}
              disabled={!hydrated || disabled}
              onClick={() => insert(before, after, multiline)}
            >
              <Icon aria-hidden />
            </Button>
          ))}
        </fieldset>
        <Textarea
          ref={textarea}
          id={id}
          name={name}
          value={value}
          rows={8}
          maxLength={20000}
          disabled={!hydrated || disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className="min-h-48 resize-y rounded-none border-0 bg-transparent p-4 shadow-none focus-visible:ring-inset"
          onBlur={onBlur}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              (event.metaKey || event.ctrlKey) &&
              ["b", "i"].includes(event.key.toLowerCase())
            ) {
              event.preventDefault();
              const marker = event.key.toLowerCase() === "b" ? "**" : "_";
              insert(marker, marker);
            }
          }}
        />
      </TabsContent>
      <TabsContent value="preview" className="mt-0 min-h-48 p-4">
        {value.trim() ? (
          <MarkdownContent>{value}</MarkdownContent>
        ) : (
          <p className="text-sm text-muted-foreground">
            {m.markdownEmptyPreview()}
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
}
