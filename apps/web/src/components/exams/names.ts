import type { ExamBoard } from "@faridalms/domain/exams";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatMonthLabel } from "~/utils/datetime";

export const BOARD_LABEL: Record<ExamBoard, () => string> = {
  cambridge: m.examBoardCambridge,
  pearson: m.examBoardPearson,
  ib: m.examBoardIb,
  jcq: m.examBoardJcq,
};

export interface NamedBoard {
  id: string;
  titleEn: string | null;
  titleAr: string | null;
}

export interface NamedSession {
  official: { board: ExamBoard } | null;
  boardId: string | null;
  titleEn: string | null;
  titleAr: string | null;
  sitsIn: string;
}

export function boardTitle(board: NamedBoard): string {
  return inLocale(board.titleEn, board.titleAr);
}

/** "Cambridge International, June 2027", or the school's own title. */
export function sessionName(session: NamedSession): string {
  if (session.official)
    return m.examSessionName({
      board: BOARD_LABEL[session.official.board](),
      month: formatMonthLabel(session.sitsIn),
    });
  return inLocale(session.titleEn, session.titleAr);
}

/** Whose rules a session follows: the board it belongs to. */
export function sessionBoard(
  session: NamedSession,
  boards: readonly NamedBoard[],
): string {
  if (session.official) return BOARD_LABEL[session.official.board]();
  const board = boards.find((row) => row.id === session.boardId);
  return board ? boardTitle(board) : "";
}

// First-strong isolates, built from code points since the formatter turns
// escapes into invisible literal characters.
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);

/**
 * Parts such as a session's name and its English component name, each kept
 * in its own direction so a mixed line reads in order in either language.
 */
export function isolatedLine(parts: readonly (string | null | undefined)[]) {
  return parts
    .filter((part): part is string => Boolean(part))
    .map((part) => `${FSI}${part}${PDI}`)
    .join(" · ");
}
