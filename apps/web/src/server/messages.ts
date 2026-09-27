import {
  draftSchema,
  inboxQuerySchema,
  membersSchema,
  recipientsQuerySchema,
  sendSchema,
  startSchema,
  threadQuerySchema,
} from "@faridalms/domain/messages";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { checked } from "./input";

const threadId = v.object({ threadId: v.pipe(v.string(), v.uuid()) });

export const getInbox = createServerFn({ method: "GET" })
  .validator(checked(inboxQuerySchema))
  .handler(({ data }) => backend().messages.inbox(data));

export const getUnreadThreads = createServerFn({ method: "GET" }).handler(() =>
  backend().messages.unread(),
);

export const getThread = createServerFn({ method: "GET" })
  .validator(checked(threadQuerySchema))
  .handler(({ data }) => record(backend().messages.thread(data)));

export const getRecipients = createServerFn({ method: "GET" })
  .validator(checked(recipientsQuerySchema))
  .handler(({ data }) => backend().messages.recipients(data));

export const sendMessage = createServerFn({ method: "POST" })
  .validator(checked(sendSchema))
  .handler(({ data }) => backend().messages.send(data));

export const startThread = createServerFn({ method: "POST" })
  .validator(checked(startSchema))
  .handler(({ data }) => backend().messages.start(data));

export const markThreadRead = createServerFn({ method: "POST" })
  .validator(checked(threadId))
  .handler(({ data }) => backend().messages.markRead(data));

export const saveThreadDraft = createServerFn({ method: "POST" })
  .validator(checked(draftSchema))
  .handler(({ data }) => backend().messages.saveDraft(data));

export const changeMembers = createServerFn({ method: "POST" })
  .validator(checked(membersSchema))
  .handler(({ data }) => backend().messages.members(data));
