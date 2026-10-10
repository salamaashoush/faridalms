/** What the editor's frame says, given by the application in the reader's language. */
export interface EditorStrings {
  /** The frame's name, for a reader who cannot see it. */
  title: string;
  loading: string;
  /** Said when the editor could not be reached, as where none is installed. */
  missing: string;
}
