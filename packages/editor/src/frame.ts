/**
 * The editor's frame, shared with the preview a page draws before the editor
 * has loaded, so swapping one for the other moves nothing on the page.
 */
const join = (...names: (string | false | undefined)[]) =>
  names.filter(Boolean).join(" ");

export const editorFrame = {
  surface: (document: boolean, invalid = false) =>
    join(
      "fe-surface group/editor relative",
      document
        ? "fe-document"
        : "overflow-visible rounded-xl border bg-background shadow-xs transition-shadow focus-within:border-ring/50 focus-within:ring-3 focus-within:ring-ring/15",
      invalid && "border-destructive",
    ),
  toolbar: (document: boolean) =>
    document
      ? "sticky top-12 z-20 -mx-1 mb-3 rounded-lg border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80"
      : "overflow-hidden rounded-t-xl border-b",
  content: (document: boolean) =>
    join(
      "fe relative",
      document
        ? "min-h-[40vh] ps-9 sm:-ms-14 sm:ps-14"
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
