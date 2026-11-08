/**
 * Whether focus may be moved to a form's problems once they are drawn: not
 * when the person has gone on to another control since submitting. Focus
 * dropped to the page, as a button disabled while saving drops it, is not
 * a move.
 */
export function mayMoveFocus(before: Element | null, doc: Document): boolean {
  const now = doc.activeElement;
  return now === before || now === null || now === doc.body;
}
