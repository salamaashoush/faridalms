import type { ReactNode } from "react";

import { cn } from "../cn";

/**
 * How wide a page reads, by what it is for: 1600px for a list, board, home
 * or report, which need room for columns; 1280px for a record's two columns;
 * 720px for a form, settings or steps, one column top to bottom.
 */
export type PageWidth = "list" | "record" | "form";

const WIDTH: Record<PageWidth, string> = {
  list: "max-w-[100rem]",
  record: "max-w-7xl",
  form: "max-w-[45rem]",
};

export interface PageProps {
  width: PageWidth;
  children: ReactNode;
}

/**
 * A page's content, centred in the space the shell leaves and no wider
 * than its kind of page reads well at. Every page sets its width here, so
 * two pages of one kind are never different widths.
 */
export function Page({ width, children }: PageProps) {
  return <div className={cn("mx-auto w-full", WIDTH[width])}>{children}</div>;
}
