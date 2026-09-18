import type { Components } from "react-markdown";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a: ({ href, children }) => (
    <a href={href} rel="nofollow noreferrer">
      {children}
    </a>
  ),
  img: ({ alt }) => <span>{alt}</span>,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
};

export function MarkdownContent({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none break-words dark:prose-invert prose-headings:font-semibold prose-a:text-primary prose-pre:overflow-x-auto">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </Markdown>
    </div>
  );
}
