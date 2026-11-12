import {
  sharedPieceSchema,
  sharedWorkQuerySchema,
  shareWorkSchema,
} from "@faridalms/domain/coursework";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";
import { checked } from "./input";

export const getSharedWork = createServerFn({ method: "GET" })
  .validator(checked(sharedWorkQuerySchema))
  .handler(({ data }) => backend().familyShares.list(data));

export const getSharedPiece = createServerFn({ method: "GET" })
  .validator(checked(sharedPieceSchema))
  .handler(({ data }) => backend().familyShares.piece(data));

export const getSharedStudents = createServerFn({ method: "GET" })
  .validator(checked(v.object({ assignmentId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => backend().familyShares.ofAssignment(data));

export const shareWork = createServerFn({ method: "POST" })
  .validator(checked(shareWorkSchema))
  .handler(({ data }) => backend().familyShares.share(data));
