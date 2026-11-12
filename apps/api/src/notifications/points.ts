import type {
  NoticeParams,
  NotificationKind,
} from "@faridalms/domain/notifications";

import { point } from "../core/extension";

/** One line of an email or a text, from what the notice's producer recorded. */
export type NoticeLine = (params: NoticeParams) => string;

/** How a module words, in an email or a text, the notices it sends. */
export interface NoticeLines {
  kind: NotificationKind;
  /** Of a kind several send, the notices this module words. */
  sends?(params: NoticeParams): boolean;
  en: NoticeLine;
  ar: NoticeLine;
}

export const noticeLines = point<NoticeLines>("notice lines");
