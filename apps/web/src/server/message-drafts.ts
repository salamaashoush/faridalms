import {
  messageDraftQuerySchema,
  saveMessageDraftSchema,
  sendMessageDraftSchema,
} from "@faridalms/domain/message-draft";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";

export const getMessageDraft = createServerFn({ method: "GET" })
  .inputValidator(messageDraftQuerySchema)
  .handler(({ data }) => backend().getMessageDraft(data));
export const getMessageDrafts = createServerFn({ method: "GET" })
  .inputValidator(v.object({ page: v.number() }))
  .handler(({ data }) => backend().getMessageDrafts(data));
export const saveMessageDraft = createServerFn({ method: "POST" })
  .inputValidator(saveMessageDraftSchema)
  .handler(({ data }) => backend().saveMessageDraft(data));
export const sendMessageDraft = createServerFn({ method: "POST" })
  .inputValidator(sendMessageDraftSchema)
  .handler(({ data }) => backend().sendMessageDraft(data));
