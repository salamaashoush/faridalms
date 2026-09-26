import type { ReferenceElement } from "@floating-ui/dom";
import type { BaseSelection } from "lexical";

import { Menu } from "@base-ui/react/menu";
import { $isCodeNode } from "@lexical/code";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ESCAPE_COMMAND,
} from "lexical";
import {
  Baseline,
  Bold,
  ChevronDown,
  Code,
  ExternalLink,
  Italic,
  Link,
  Pencil,
  Strikethrough,
  Underline,
  Unlink,
} from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { BlockType } from "../blocks";
import type { MarkFormat } from "../formatting";
import type { EditorColor } from "../strings";

import {
  $anchorFor,
  $blockTypeOf,
  $currentBlock,
  $turnInto,
  blockDefinitions,
} from "../blocks";
import { useEditorEnvironment } from "../context";
import {
  $activeFormats,
  $applyColor,
  $currentLinkUrl,
  $selectionColors,
  applyLink,
  backgroundColors,
  normaliseUrl,
  OPEN_LINK_EDITOR_COMMAND,
  textColors,
} from "../formatting";
import { editorColors } from "../strings";
import {
  Floating,
  Tip,
  ToolButton,
  cx,
  menuItemClass,
  menuPopupClass,
  selectionReference,
  shortcutLabel,
} from "../ui";

type Mode = "hidden" | "format" | "link-edit" | "link-view";

interface Facts {
  formats: MarkFormat[];
  block: BlockType | null;
  link: string | null;
  color: string;
  background: string;
}

const empty: Facts = {
  formats: [],
  block: null,
  link: null,
  color: "",
  background: "",
};

export function SelectionToolbarPlugin() {
  const [editor] = useLexicalComposerContext();
  const editable = useLexicalEditable();
  const { strings } = useEditorEnvironment();
  const [mode, setMode] = useState<Mode>("hidden");
  const [reference, setReference] = useState<ReferenceElement | null>(null);
  const [facts, setFacts] = useState<Facts>(empty);
  const [url, setUrl] = useState("");
  const [invalid, setInvalid] = useState(false);
  const saved = useRef<BaseSelection | null>(null);
  const pointer = useRef(false);
  const menus = useRef(0);
  const toolbar = useRef<HTMLDivElement>(null);

  const read = () =>
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return null;
      const block = $currentBlock();
      return {
        collapsed: selection.isCollapsed(),
        code: $isCodeNode(block),
        text: selection.getTextContent(),
        facts: {
          formats: $activeFormats(),
          block: $blockTypeOf($anchorFor("paragraph")),
          link: $currentLinkUrl(),
          ...$selectionColors(),
        },
      };
    });

  const modeRef = useRef<Mode>("hidden");
  const show = (next: Mode) => {
    modeRef.current = next;
    setMode(next);
  };

  const refresh = () => {
    if (pointer.current || menus.current > 0) return;
    if (modeRef.current === "link-edit") return;
    const root = editor.getRootElement();
    const focused = root !== null && root.contains(document.activeElement);
    const state = focused ? read() : null;
    if (!state) return show("hidden");
    setFacts(state.facts);
    if (!state.collapsed && !state.code && state.text.trim()) {
      setReference(selectionReference());
      return show("format");
    }
    if (state.collapsed && state.facts.link) {
      const anchor = window.getSelection()?.anchorNode;
      const element =
        anchor instanceof Element ? anchor : anchor?.parentElement;
      setReference(element?.closest("a") ?? selectionReference());
      return show("link-view");
    }
    show("hidden");
  };

  const openLinkEditor = () => {
    const state = read();
    saved.current = editor
      .getEditorState()
      .read(() => $getSelection()?.clone() ?? null);
    setUrl(state?.facts.link ?? "");
    setInvalid(false);
    setReference(selectionReference() ?? reference);
    show("link-edit");
  };

  const onRefresh = useEffectEvent(refresh);
  const onOpenLink = useEffectEvent(openLinkEditor);
  const onEscape = useEffectEvent(() => {
    if (modeRef.current === "hidden") return false;
    show("hidden");
    return true;
  });
  const onPointerDown = useEffectEvent(() => {
    pointer.current = true;
    if (modeRef.current !== "link-edit") show("hidden");
  });

  useEffect(() => {
    if (!editable) return undefined;
    const down = () => onPointerDown();
    const up = () => {
      if (!pointer.current) return;
      pointer.current = false;
      requestAnimationFrame(() => onRefresh());
    };
    document.addEventListener("pointerup", up);
    return mergeRegister(
      () => document.removeEventListener("pointerup", up),
      editor.registerRootListener((next, previous) => {
        previous?.removeEventListener("pointerdown", down);
        next?.addEventListener("pointerdown", down);
      }),
      editor.registerUpdateListener(() => onRefresh()),
      editor.registerCommand(
        OPEN_LINK_EDITOR_COMMAND,
        () => {
          onOpenLink();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            !event.shiftKey &&
            event.key.toLowerCase() === "k"
          ) {
            event.preventDefault();
            onOpenLink();
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => onEscape(),
        COMMAND_PRIORITY_LOW,
      ),
    );
  }, [editor, editable]);

  useEffect(() => {
    if (mode === "hidden" || mode === "link-edit") return undefined;
    const onFocus = () => {
      const active = document.activeElement;
      const root = editor.getRootElement();
      if (
        menus.current === 0 &&
        !toolbar.current?.contains(active) &&
        !root?.contains(active)
      )
        onEscape();
    };
    document.addEventListener("focusin", onFocus);
    const onBlur = () => requestAnimationFrame(onFocus);
    const root = editor.getRootElement();
    root?.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("focusin", onFocus);
      root?.removeEventListener("blur", onBlur);
    };
  }, [editor, mode]);

  if (!editable || mode === "hidden" || !reference) return null;

  const trackMenu = (open: boolean) => {
    if (open) {
      saved.current = editor
        .getEditorState()
        .read(() => $getSelection()?.clone() ?? null);
      menus.current += 1;
    } else menus.current = Math.max(0, menus.current - 1);
  };

  const withSelection = (change: () => void) => {
    editor.update(() => {
      if (saved.current) $setSelection(saved.current.clone());
      change();
    });
    editor.focus();
  };

  if (mode === "link-edit") {
    const submit = () => {
      const next = url.trim() ? normaliseUrl(url) : null;
      if (url.trim() && !next) {
        setInvalid(true);
        return;
      }
      applyLink(editor, saved.current, next);
      show("hidden");
    };
    return (
      <Floating
        reference={reference}
        placement="bottom-start"
        className="flex w-80 max-w-[calc(100vw-1rem)] flex-col gap-1.5 p-2"
      >
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            ref={(element) => element?.focus()}
            type="text"
            inputMode="url"
            dir="ltr"
            aria-label={strings.linkUrl}
            aria-invalid={invalid}
            placeholder="https://"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                show("hidden");
                editor.focus();
              }
            }}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive"
          />
          <button
            type="submit"
            className="h-8 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {strings.linkApply}
          </button>
          {facts.link ? (
            <ToolButton
              label={strings.linkRemove}
              onClick={() => {
                applyLink(editor, saved.current, null);
                show("hidden");
              }}
            >
              <Unlink aria-hidden />
            </ToolButton>
          ) : null}
        </form>
        {invalid ? (
          <p role="alert" className="px-0.5 text-xs text-destructive">
            {strings.linkInvalid}
          </p>
        ) : null}
      </Floating>
    );
  }

  if (mode === "link-view" && facts.link) {
    return (
      <Floating
        reference={reference}
        placement="bottom-start"
        className="flex max-w-[min(24rem,calc(100vw-1rem))] items-center gap-1 p-1"
        keepFocus
        role="toolbar"
        label={strings.link}
      >
        <a
          href={facts.link}
          target="_blank"
          rel="noopener noreferrer"
          dir="ltr"
          className="flex min-w-0 items-center gap-1.5 truncate rounded-md px-2 py-1 text-sm text-primary hover:bg-accent"
          aria-label={`${strings.linkOpen}: ${facts.link}`}
        >
          <ExternalLink className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{facts.link}</span>
        </a>
        <ToolButton label={strings.link} onClick={openLinkEditor}>
          <Pencil aria-hidden />
        </ToolButton>
        <ToolButton
          label={strings.linkRemove}
          onClick={() => {
            applyLink(editor, null, null);
            show("hidden");
          }}
        >
          <Unlink aria-hidden />
        </ToolButton>
      </Floating>
    );
  }

  const marks: {
    format: MarkFormat;
    label: string;
    icon: typeof Bold;
    shortcut: string;
  }[] = [
    { format: "bold", label: strings.bold, icon: Bold, shortcut: "Mod+B" },
    {
      format: "italic",
      label: strings.italic,
      icon: Italic,
      shortcut: "Mod+I",
    },
    {
      format: "underline",
      label: strings.underline,
      icon: Underline,
      shortcut: "Mod+U",
    },
    {
      format: "strikethrough",
      label: strings.strikethrough,
      icon: Strikethrough,
      shortcut: "Mod+Shift+S",
    },
    {
      format: "code",
      label: strings.inlineCode,
      icon: Code,
      shortcut: "Mod+E",
    },
  ];
  const current = blockDefinitions.find((block) => block.type === facts.block);
  const convertible = blockDefinitions.filter((block) => block.convertible);

  return (
    <Floating
      reference={reference}
      placement="top-start"
      className="flex items-center gap-0.5 p-1"
      keepFocus
      role="toolbar"
      label={strings.formatting}
    >
      <div ref={toolbar} className="contents">
        <Menu.Root onOpenChange={trackMenu}>
          <Menu.Trigger
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-foreground/80 hover:bg-accent hover:text-foreground"
            aria-label={strings.turnInto}
          >
            {current ? current.label(strings) : strings.turnInto}
            <ChevronDown className="size-3.5 opacity-60" aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className="z-50" sideOffset={6} align="start">
              <Menu.Popup
                className={cx(menuPopupClass, "max-h-80 overflow-y-auto")}
                finalFocus={false}
              >
                {convertible.map((block) => (
                  <Menu.Item
                    key={block.type}
                    className={menuItemClass}
                    onClick={() =>
                      withSelection(() => {
                        const target = $anchorFor(block.type);
                        if (target) $turnInto(target, block.type);
                      })
                    }
                  >
                    <block.icon aria-hidden />
                    <span className="flex-1">{block.label(strings)}</span>
                    {facts.block === block.type ? (
                      <span className="size-1.5 rounded-full bg-primary" />
                    ) : null}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
        {marks.map((mark) => (
          <ToolButton
            key={mark.format}
            label={mark.label}
            shortcut={shortcutLabel(mark.shortcut)}
            active={facts.formats.includes(mark.format)}
            onClick={() =>
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, mark.format)
            }
          >
            <mark.icon aria-hidden />
          </ToolButton>
        ))}
        <ToolButton
          label={strings.link}
          shortcut={shortcutLabel("Mod+K")}
          active={Boolean(facts.link)}
          onClick={openLinkEditor}
        >
          <Link aria-hidden />
        </ToolButton>
        <ColorMenu
          facts={facts}
          onOpenChange={trackMenu}
          onPick={(property, value) =>
            withSelection(() => $applyColor(property, value))
          }
        />
      </div>
    </Floating>
  );
}

function ColorMenu({
  facts,
  onOpenChange,
  onPick,
}: {
  facts: Facts;
  onOpenChange: (open: boolean) => void;
  onPick: (
    property: "color" | "background-color",
    value: string | null,
  ) => void;
}) {
  const { strings } = useEditorEnvironment();
  const swatch = (color: EditorColor, background: boolean) => (
    <Menu.Item
      key={`${background ? "bg" : "fg"}-${color}`}
      className={menuItemClass}
      onClick={() =>
        onPick(
          background ? "background-color" : "color",
          background ? backgroundColors[color] : textColors[color],
        )
      }
    >
      <span
        aria-hidden
        className="flex size-5 items-center justify-center rounded border text-xs font-semibold"
        style={
          background
            ? { backgroundColor: backgroundColors[color] }
            : { color: textColors[color] }
        }
      >
        A
      </span>
      <span className="flex-1">{strings.colors[color]}</span>
      {(background ? facts.background : facts.color) ===
      (background ? backgroundColors[color] : textColors[color]) ? (
        <span className="size-1.5 rounded-full bg-primary" />
      ) : null}
    </Menu.Item>
  );
  return (
    <Menu.Root onOpenChange={onOpenChange}>
      <Tip label={strings.textColor}>
        <Menu.Trigger
          aria-label={strings.textColor}
          className="inline-flex h-8 items-center gap-0.5 rounded-md px-1.5 text-foreground/80 hover:bg-accent hover:text-foreground"
        >
          <Baseline
            className="size-4"
            style={facts.color ? { color: facts.color } : undefined}
            aria-hidden
          />
          <ChevronDown className="size-3 opacity-60" aria-hidden />
        </Menu.Trigger>
      </Tip>
      <Menu.Portal>
        <Menu.Positioner className="z-50" sideOffset={6} align="start">
          <Menu.Popup
            className={cx(menuPopupClass, "max-h-96 w-56 overflow-y-auto")}
            finalFocus={false}
          >
            <Menu.Group>
              <Menu.GroupLabel className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
                {strings.textColor}
              </Menu.GroupLabel>
              <Menu.Item
                className={menuItemClass}
                onClick={() => onPick("color", null)}
              >
                <span
                  aria-hidden
                  className="flex size-5 items-center justify-center rounded border text-xs font-semibold"
                >
                  A
                </span>
                <span className="flex-1">{strings.defaultColor}</span>
              </Menu.Item>
              {editorColors.map((color) => swatch(color, false))}
            </Menu.Group>
            <Menu.Separator className="-mx-1 my-1 h-px bg-border" />
            <Menu.Group>
              <Menu.GroupLabel className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground">
                {strings.highlight}
              </Menu.GroupLabel>
              <Menu.Item
                className={menuItemClass}
                onClick={() => onPick("background-color", null)}
              >
                <span aria-hidden className="size-5 rounded border" />
                <span className="flex-1">{strings.defaultColor}</span>
              </Menu.Item>
              {editorColors.map((color) => swatch(color, true))}
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
