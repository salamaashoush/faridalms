import type { ReactNode } from "react";

import { ToolbarRow } from "./panel";

export interface DocumentViewProps {
  /** Names the document for screen readers, such as "Invoice INV-2026-00012". */
  label: string;
  /** How it is shown, such as its language, at the start of the row above it. */
  tools?: ReactNode;
  /** What is done with it, such as Print, at the end of that row. */
  actions?: ReactNode;
  /** The document itself, as the customer receives it. */
  children: ReactNode;
}

/**
 * A printable document read in a record's tab (an invoice, a quote): one
 * row of tools and actions above the paper, which is framed on screen and
 * printed alone, without the console around it.
 */
export function DocumentView({
  label,
  tools,
  actions,
  children,
}: DocumentViewProps) {
  return (
    <section aria-label={label} className="grid min-w-0 gap-3">
      {tools || actions ? (
        <ToolbarRow.Provider value>
          <div className="flex min-h-8 flex-wrap items-center gap-2 print:hidden">
            {tools ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {tools}
              </div>
            ) : null}
            {actions ? (
              <div className="ms-auto flex flex-wrap items-center gap-2">
                {actions}
              </div>
            ) : null}
          </div>
        </ToolbarRow.Provider>
      ) : null}
      {/* The paper keeps a page's width and scrolls sideways on a phone,
          as a PDF does, rather than squeezing its table of lines apart. */}
      <div
        data-print-document
        className="min-w-0 overflow-x-auto rounded-lg border bg-card p-2 shadow-sm print:overflow-visible print:border-0 print:p-0 print:shadow-none"
      >
        <div className="min-w-[40rem] print:min-w-0">{children}</div>
      </div>
    </section>
  );
}
