/**
 * The editor's frame, shared with the preview a page draws before the editor
 * has loaded, so swapping one for the other moves nothing on the page.
 */
const join = (...names: (string | false | undefined)[]) =>
  names.filter(Boolean).join(" ");

/**
 * A document fills the page, a field is a form's box with its count, and a
 * message is a conversation's composer: the words first, the tools beneath
 * them with the send button at their end, as people know from chat.
 */
export type EditorVariant = "document" | "field" | "message";

export const editorFrame = {
  surface: (variant: EditorVariant, invalid = false, focused = false) =>
    join(
      "fe-surface group/editor",
      focused ? "fixed" : "relative",
      // A document fills the screen, so its status bar's own place is never
      // above the fold and it sticks to the bottom however short the text.
      variant === "document"
        ? "fe-document flex min-h-dvh flex-col"
        : "overflow-visible rounded-xl border bg-background shadow-xs transition-shadow focus-within:border-ring/50 focus-within:ring-3 focus-within:ring-ring/15",
      invalid && "border-destructive",
      // Focus mode sets the writing alone on the screen, in a reading column.
      focused &&
        "inset-0 z-50 overflow-y-auto bg-background px-4 pt-4 sm:px-8 [&>*]:mx-auto [&>*]:max-w-3xl",
    ),
  toolbar: (variant: EditorVariant, focused = false) =>
    variant === "document"
      ? join(
          "sticky z-20 -mx-1 mb-3 rounded-lg border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80",
          focused ? "top-0" : "top-12",
        )
      : variant === "message"
        ? "flex items-center gap-2 rounded-b-xl border-t pe-1.5"
        : "overflow-hidden rounded-t-xl border-b",
  content: (variant: EditorVariant) =>
    join(
      "fe relative",
      variant === "document"
        ? "flex-1 min-h-[40vh] ps-9 sm:-ms-14 sm:ps-14"
        : variant === "message"
          ? // Long words scroll inside the box, so the conversation above
            // keeps most of a short screen.
            "max-h-[min(16rem,33svh)] overflow-y-auto ps-10 pe-4 py-2"
          : "min-h-36 ps-10 pe-4 py-3",
    ),
  editable: (variant: EditorVariant) =>
    join(
      "fe-editable outline-none",
      variant === "document"
        ? "min-h-[40vh] pb-24"
        : variant === "message"
          ? "min-h-12"
          : "min-h-30",
    ),
  footer: (variant: EditorVariant) =>
    join(
      "flex items-center justify-between gap-3 px-4 py-1.5 text-xs text-muted-foreground",
      variant !== "document" && "border-t bg-muted/20 rounded-b-xl",
    ),
};
