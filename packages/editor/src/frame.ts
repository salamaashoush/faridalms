/**
 * The editor's frame, shared with the preview a page draws before the editor
 * has loaded, so swapping one for the other moves nothing on the page.
 */
const join = (...names: (string | false | undefined)[]) =>
  names.filter(Boolean).join(" ");

export const editorFrame = {
  surface: (document: boolean, invalid = false, focused = false) =>
    join(
      "fe-surface group/editor",
      focused ? "fixed" : "relative",
      // A document fills the screen, so its status bar's own place is never
      // above the fold and it sticks to the bottom however short the text.
      document
        ? "fe-document flex min-h-dvh flex-col"
        : "overflow-visible rounded-xl border bg-background shadow-xs transition-shadow focus-within:border-ring/50 focus-within:ring-3 focus-within:ring-ring/15",
      invalid && "border-destructive",
      // Focus mode sets the writing alone on the screen, in a reading column.
      focused &&
        "inset-0 z-50 overflow-y-auto bg-background px-4 pt-4 sm:px-8 [&>*]:mx-auto [&>*]:max-w-3xl",
    ),
  toolbar: (document: boolean, focused = false) =>
    document
      ? join(
          "sticky z-20 -mx-1 mb-3 rounded-lg border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80",
          focused ? "top-0" : "top-12",
        )
      : "overflow-hidden rounded-t-xl border-b",
  content: (document: boolean) =>
    join(
      "fe relative",
      document
        ? "flex-1 min-h-[40vh] ps-9 sm:-ms-14 sm:ps-14"
        : "min-h-36 ps-10 pe-4 py-3",
    ),
  editable: (document: boolean) =>
    join(
      "fe-editable outline-none",
      document ? "min-h-[40vh] pb-24" : "min-h-30",
    ),
  footer: (document: boolean) =>
    join(
      "flex items-center justify-between gap-3 px-4 py-1.5 text-xs text-muted-foreground",
      !document && "border-t bg-muted/20 rounded-b-xl",
    ),
};
