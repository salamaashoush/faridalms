import type { LexicalEditor } from "lexical";

const slots = new Map<string, LexicalEditor>();

/**
 * The editor showing a document field now, by the field's id. A document
 * page starts its editor again when a new document is first saved and goes
 * live, so work that finishes later, such as an upload, looks the editor up
 * here rather than holding the one it began in.
 */
export function holdSlot(id: string, editor: LexicalEditor): () => void {
  slots.set(id, editor);
  return () => {
    if (slots.get(id) === editor) slots.delete(id);
  };
}

export function editorInSlot(id: string | undefined): LexicalEditor | null {
  return id ? (slots.get(id) ?? null) : null;
}
