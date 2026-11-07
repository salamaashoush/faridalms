import {
  colleaguesSchema,
  commentHostSchema,
  editCommentSchema,
  removeCommentSchema,
  replySchema,
  resolveThreadSchema,
  startThreadSchema,
} from "@faridalms/domain/document-comments";
import { createServerFn } from "@tanstack/react-start";

import { backend } from "./backend";
import { checked } from "./input";

export const getCommentThreads = createServerFn({ method: "GET" })
  .validator(checked(commentHostSchema))
  .handler(({ data }) => backend().comments.threads(data));

export const startCommentThread = createServerFn({ method: "POST" })
  .validator(checked(startThreadSchema))
  .handler(({ data }) => backend().comments.start(data));

export const replyToThread = createServerFn({ method: "POST" })
  .validator(checked(replySchema))
  .handler(({ data }) => backend().comments.reply(data));

export const editComment = createServerFn({ method: "POST" })
  .validator(checked(editCommentSchema))
  .handler(({ data }) => backend().comments.edit(data));

export const removeComment = createServerFn({ method: "POST" })
  .validator(checked(removeCommentSchema))
  .handler(({ data }) => backend().comments.remove(data));

export const resolveThread = createServerFn({ method: "POST" })
  .validator(checked(resolveThreadSchema))
  .handler(({ data }) => backend().comments.resolve(data));

export const findColleagues = createServerFn({ method: "GET" })
  .validator(checked(colleaguesSchema))
  .handler(({ data }) => backend().comments.colleagues(data));
