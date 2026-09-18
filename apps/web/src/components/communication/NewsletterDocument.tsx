import type {
  NewsletterDocument as Document,
  NewsletterBlock,
} from "@faridalms/domain/newsletter";

import { isSafeContentUrl } from "@faridalms/domain/rich-text";

import { Value } from "~/components/app/primitives";
import { ContentView } from "~/components/content/ContentView";
import { RichText } from "~/components/records/RichText";
import { buttonVariants } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";

export function NewsletterBlockContent({ block }: { block: NewsletterBlock }) {
  switch (block.type) {
    case "heading": {
      const Heading = block.level === 2 ? "h2" : "h3";
      return (
        <Heading
          className={cn(
            "font-semibold tracking-tight",
            block.level === 2 ? "text-2xl" : "text-xl",
            alignments[block.alignment],
          )}
        >
          {block.text}
        </Heading>
      );
    }
    case "content":
      return <ContentView document={block.content} />;
    case "text":
      return <RichText document={block.content} />;
    case "divider":
      return <hr className="border-border" />;
    case "image":
      return (
        <figure className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
          <Value>{block.alt}</Value>
          {block.caption ? (
            <figcaption className="mt-2 text-sm">{block.caption}</figcaption>
          ) : null}
        </figure>
      );
    case "button":
      return (
        <div className={alignments[block.alignment]}>
          {isSafeContentUrl(block.href) ? (
            <a
              href={block.href}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants()}
            >
              {block.label}
            </a>
          ) : (
            <span>{block.label}</span>
          )}
        </div>
      );
  }
  return null;
}
const alignments = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
};
const layouts = [
  "",
  "grid-cols-1",
  "grid-cols-1 sm:grid-cols-2",
  "grid-cols-1 sm:grid-cols-3",
];
export function NewsletterDocument({
  document,
  title,
  summary,
}: {
  document: Document;
  title: string;
  summary: string;
}) {
  return (
    <article
      dir={document.locale === "ar" ? "rtl" : "ltr"}
      className="mx-auto max-w-3xl overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <header className="space-y-4 border-b p-6 sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight">
          {title.trim() || m.newsletterUntitledDraft()}
        </h1>
        {summary ? (
          <p className="text-lg leading-relaxed text-muted-foreground">
            {summary}
          </p>
        ) : null}
      </header>
      {document.sections.map((section) => (
        <section
          key={section.id}
          className={cn(
            "grid gap-6 p-6 sm:p-10",
            layouts[section.columns.length],
            section.tone === "muted" && "bg-muted/50",
            section.tone === "accent" && "bg-primary/10",
          )}
        >
          {section.columns.map((column) => (
            <div key={column.id} className="min-w-0 space-y-6">
              {column.blocks.map((block) => (
                <NewsletterBlockContent key={block.id} block={block} />
              ))}
            </div>
          ))}
        </section>
      ))}
    </article>
  );
}
