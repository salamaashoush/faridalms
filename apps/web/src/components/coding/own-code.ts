import { createContext } from "react";

/**
 * A student's own versions of a lesson's runnable code blocks, and where a
 * changed one is kept. Outside a student's lesson there is none, and changes
 * last as long as the page.
 */
export interface OwnCode {
  codes: Record<string, { code: string; changed: boolean }>;
  keep: (blockId: string, code: string) => void;
}

export const OwnCodeContext = createContext<OwnCode | null>(null);
