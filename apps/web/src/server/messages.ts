import {
  acceptHeldSchema,
  contactsQuerySchema,
  draftRefSchema,
  draftSchema,
  draftsQuerySchema,
  inboxQuerySchema,
  membersSchema,
  mergeContactsSchema,
  recipientsQuerySchema,
  sendSchema,
  startSchema,
  threadQuerySchema,
} from "@faridalms/domain/messages";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { env } from "~/env";

import { backend, record } from "./backend";
import { checked } from "./input";

const threadId = v.object({ threadId: v.pipe(v.string(), v.uuid()) });
const byId = v.object({ id: v.pipe(v.string(), v.uuid()) });

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

export const saveMessageDraft = createServerFn({ method: "POST" })
  .validator(checked(draftSchema))
  .handler(({ data }) => backend().messages.saveDraft(data));

export const getDrafts = createServerFn({ method: "GET" })
  .validator(checked(draftsQuerySchema))
  .handler(({ data }) => backend().messages.drafts(data));

export const getDraft = createServerFn({ method: "GET" })
  .validator(checked(byId))
  .handler(({ data }) => backend().messages.draft(data));

export const discardMessageDraft = createServerFn({ method: "POST" })
  .validator(checked(draftRefSchema))
  .handler(({ data }) => backend().messages.discardDraft(data));

export const changeMembers = createServerFn({ method: "POST" })
  .validator(checked(membersSchema))
  .handler(({ data }) => backend().messages.members(data));

export const acceptHeldMail = createServerFn({ method: "POST" })
  .validator(checked(acceptHeldSchema))
  .handler(({ data }) => backend().messages.acceptHeld(data));

export const getMessageContacts = createServerFn({ method: "GET" })
  .validator(checked(contactsQuerySchema))
  .handler(({ data }) => backend().messages.contacts(data));

export const mergeMessageContacts = createServerFn({ method: "POST" })
  .validator(checked(mergeContactsSchema))
  .handler(({ data }) => backend().messages.mergeContacts(data));

/**
 * A ticket to a conversation's presence room, with the server to join.
 * Null when live collaboration is not set up or the viewer is not one who
 * replies there; the conversation then simply shows no one replying.
 */
export const replyPresence = createServerFn({ method: "POST" })
  .validator(checked(threadId))
  .handler(async ({ data }) => {
    const url = env.COLLAB_URL;
    if (!url) return null;
    try {
      return { ...(await backend().messages.presence(data)), url };
    } catch {
      return null;
    }
  });
