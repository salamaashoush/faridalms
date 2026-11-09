import type { ReactNode } from "react";

import { cn } from "../cn";
import { createContext, useContext } from "react";

/**
 * How wide a page reads, by what it is for: 1600px for a list, board, home
 * or report, which need room for columns; 1280px for a record and its tabs;
 * 720px for a form, settings or steps, one column top to bottom.
 */
export type PageWidth = "list" | "record" | "form";

const WIDTH: Record<PageWidth, string> = {
  list: "max-w-[100rem]",
  record: "max-w-7xl",
  form: "max-w-[45rem]",
};

const RANK: Record<PageWidth, number> = { list: 3, record: 2, form: 1 };

const PageWidthContext = createContext<PageWidth | null>(null);

export interface PageProps {
  width: PageWidth;
  children: ReactNode;
}

/**
 * A page's content, centred in the space the shell leaves and no wider
 * than its kind of page reads well at. Every page sets its width here, so
 * two pages of one kind are never different widths.
 *
 * Inside another page it narrows only: a settings tab in a wider page keeps
 * its form measure at the start edge, under the page's own header and tabs,
 * and a part as wide as the page or wider adds nothing.
 */
export function Page({ width, children }: PageProps) {
  const outer = useContext(PageWidthContext);
  if (outer && RANK[width] >= RANK[outer]) return children;
  return (
    <PageWidthContext.Provider value={width}>
      <div
        data-slot="page"
        data-width={width}
        className={cn("w-full", !outer && "mx-auto", WIDTH[width])}
      >
        {children}
      </div>
    </PageWidthContext.Provider>
  );
}
