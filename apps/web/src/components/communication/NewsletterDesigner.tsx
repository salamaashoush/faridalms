import type {
  NewsletterBlock,
  NewsletterDocument,
} from "@faridalms/domain/newsletter";

import {
  richTextToContent,
  emptyContent,
} from "@faridalms/domain/content-conversion";
import { moveNewsletterBlock } from "@faridalms/domain/newsletter";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { ManagementInput } from "~/components/admin/ManagementDialog";
import { ContentEditor } from "~/components/content/ContentEditor";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";

export function NewsletterDesigner({
  document,
  onChange,
  onValidityChange,
  disabled,
}: {
  document: NewsletterDocument;
  onChange: (value: NewsletterDocument) => void;
  onValidityChange: (id: string, valid: boolean) => void;
  disabled: boolean;
}) {
  const updateBlock = (block: NewsletterBlock) =>
    onChange({
      ...document,
      sections: document.sections.map((section) => ({
        ...section,
        columns: section.columns.map((column) => ({
          ...column,
          blocks: column.blocks.map((current) =>
            current.id === block.id ? block : current,
          ),
        })),
      })),
    });
  const removeBlock = (id: string) => {
    onValidityChange(id, true);
    onChange({
      ...document,
      sections: document.sections.map((section) => ({
        ...section,
        columns: section.columns.map((column) => ({
          ...column,
          blocks: column.blocks.filter((block) => block.id !== id),
        })),
      })),
    });
  };
  const addBlock = (columnId: string, type: "heading" | "text" | "divider") => {
    const id = crypto.randomUUID();
    const block: NewsletterBlock =
      type === "heading"
        ? { id, type, text: "", level: 2, alignment: "start" }
        : type === "text"
          ? { id, type: "content", content: emptyContent() }
          : { id, type };
    onChange({
      ...document,
      sections: document.sections.map((section) => ({
        ...section,
        columns: section.columns.map((column) =>
          column.id === columnId
            ? { ...column, blocks: [...column.blocks, block] }
            : column,
        ),
      })),
    });
  };
  return (
    <div className="space-y-6">
      {document.sections.map((section, sectionIndex) => (
        <section
          key={section.id}
          className="rounded-xl border bg-card shadow-sm"
        >
          <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
            <h2 className="text-sm font-semibold">
              {m.newsletterSection({ number: sectionIndex + 1 })}
            </h2>
            <div className="flex flex-wrap gap-1">
              {(["plain", "muted", "accent"] as const).map((tone) => (
                <Button
                  key={tone}
                  size="sm"
                  variant={section.tone === tone ? "secondary" : "ghost"}
                  type="button"
                  aria-pressed={section.tone === tone}
                  onClick={() =>
                    onChange({
                      ...document,
                      sections: document.sections.map((item) =>
                        item.id === section.id ? { ...item, tone } : item,
                      ),
                    })
                  }
                >
                  {tone === "plain"
                    ? m.newsletterTonePlain()
                    : tone === "muted"
                      ? m.newsletterToneMuted()
                      : m.newsletterToneAccent()}
                </Button>
              ))}
            </div>
          </header>
          <div
            className={
              section.columns.length === 3
                ? "grid gap-5 p-5 xl:grid-cols-3"
                : section.columns.length === 2
                  ? "grid gap-5 p-5 lg:grid-cols-2"
                  : "grid gap-5 p-5"
            }
          >
            {section.columns.map((column, columnIndex) => (
              <div key={column.id} className="min-w-0 space-y-4">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {m.newsletterColumn({ number: columnIndex + 1 })}
                </h3>
                {column.blocks.map((block, index) => (
                  <div
                    key={block.id}
                    className="space-y-3 rounded-lg border bg-background p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {m.newsletterBlockNumber({ number: index + 1 })}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={m.newsletterMoveUp()}
                          disabled={index === 0}
                          onClick={() =>
                            onChange(
                              moveNewsletterBlock(
                                document,
                                block.id,
                                column.id,
                                index - 1,
                              ),
                            )
                          }
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={m.newsletterMoveDown()}
                          disabled={index === column.blocks.length - 1}
                          onClick={() =>
                            onChange(
                              moveNewsletterBlock(
                                document,
                                block.id,
                                column.id,
                                index + 1,
                              ),
                            )
                          }
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={m.newsletterRemoveBlock()}
                          onClick={() => removeBlock(block.id)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </div>
                    {block.type === "heading" ? (
                      <ManagementInput
                        label={m.newsletterHeading()}
                        value={block.text}
                        maxLength={255}
                        onChange={(event) =>
                          updateBlock({ ...block, text: event.target.value })
                        }
                      />
                    ) : null}
                    {block.type === "text" || block.type === "content" ? (
                      <ContentEditor
                        id={`newsletter-text-${block.id}`}
                        label={m.newsletterText()}
                        value={
                          block.type === "text"
                            ? richTextToContent(block.content)
                            : block.content
                        }
                        onChange={(content) =>
                          updateBlock({
                            id: block.id,
                            type: "content",
                            content,
                          })
                        }
                        onValidityChange={(valid) =>
                          onValidityChange(block.id, valid)
                        }
                        disabled={disabled}
                      />
                    ) : null}
                    {block.type === "divider" ? <hr className="my-5" /> : null}
                    {block.type === "button" ? (
                      <>
                        <ManagementInput
                          label={m.newsletterButtonLabel()}
                          value={block.label}
                          onChange={(event) =>
                            updateBlock({ ...block, label: event.target.value })
                          }
                        />
                        <ManagementInput
                          label={m.newsletterButtonUrl()}
                          value={block.href}
                          onChange={(event) =>
                            updateBlock({ ...block, href: event.target.value })
                          }
                        />
                      </>
                    ) : null}
                    {block.type === "image" ? (
                      <>
                        <ManagementInput
                          label={m.newsletterImageAlt()}
                          value={block.alt}
                          onChange={(event) =>
                            updateBlock({ ...block, alt: event.target.value })
                          }
                        />
                        <ManagementInput
                          label={m.newsletterImageCaption()}
                          value={block.caption}
                          onChange={(event) =>
                            updateBlock({
                              ...block,
                              caption: event.target.value,
                            })
                          }
                        />
                      </>
                    ) : null}
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 rounded-lg border border-dashed p-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addBlock(column.id, "heading")}
                  >
                    {m.newsletterAddHeading()}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addBlock(column.id, "text")}
                  >
                    {m.newsletterAddText()}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => addBlock(column.id, "divider")}
                  >
                    {m.newsletterAddDivider()}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-5">
        <span className="me-auto text-sm font-medium">
          {m.newsletterAddSection()}
        </span>
        {[1, 2, 3].map((count) => (
          <Button
            key={count}
            type="button"
            variant="outline"
            onClick={() =>
              onChange({
                ...document,
                sections: [
                  ...document.sections,
                  {
                    id: crypto.randomUUID(),
                    tone: "plain",
                    columns: Array.from({ length: count }, () => ({
                      id: crypto.randomUUID(),
                      blocks: [],
                    })),
                  },
                ],
              })
            }
          >
            <Plus aria-hidden />
            {count === 1
              ? m.newsletterOneColumn()
              : count === 2
                ? m.newsletterTwoColumns()
                : m.newsletterThreeColumns()}
          </Button>
        ))}
      </div>
    </div>
  );
}
