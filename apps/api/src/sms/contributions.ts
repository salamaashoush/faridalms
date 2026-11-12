import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { noticeChannels } from "../core/notify";

/** Texts as a channel notices reach people by. */
export const SMS: ModuleContributions = {
  module: "sms",
  contributions: [contribute(noticeChannels, { channel: "sms" })],
};
