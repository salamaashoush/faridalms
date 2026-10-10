import type { ProjectFile } from "@faridalms/domain/project";

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

/**
 * A student's own projects in a lesson as they last left them, and where a
 * changed one is kept. Outside a student's lesson there is none, and a
 * project lasts as long as the page.
 */
export interface OwnProjects {
  projects: Record<string, { files: ProjectFile[]; changed: boolean }>;
  keep: (blockId: string, files: ProjectFile[]) => Promise<unknown>;
}

export const OwnProjectsContext = createContext<OwnProjects | null>(null);
