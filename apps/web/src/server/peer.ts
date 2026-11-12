import {
  hidePeerReviewSchema,
  peerCommentSchema,
  peerReviewInputSchema,
  ratePeerReviewSchema,
  removePeerCommentSchema,
} from "@faridalms/domain/peer-review";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend, record } from "./backend";
import { checked } from "./input";

const uuid = v.pipe(v.string(), v.uuid());

export const getPeerSettings = createServerFn({ method: "GET" })
  .validator(checked(v.object({ assignmentId: uuid })))
  .handler(({ data }) => backend().peer.settings(data));

export const getPeerOverview = createServerFn({ method: "GET" })
  .validator(checked(v.object({ assignmentId: uuid })))
  .handler(({ data }) => record(backend().peer.overview(data)));

export const startPeerReview = createServerFn({ method: "POST" })
  .validator(checked(v.object({ assignmentId: uuid })))
  .handler(({ data }) => backend().peer.start(data));

export const releasePeerReviews = createServerFn({ method: "POST" })
  .validator(checked(v.object({ assignmentId: uuid })))
  .handler(({ data }) => backend().peer.release(data));

export const hidePeerReview = createServerFn({ method: "POST" })
  .validator(checked(hidePeerReviewSchema))
  .handler(({ data }) => backend().peer.hide(data));

export const getMyPeerReviews = createServerFn({ method: "GET" })
  .validator(checked(v.object({ assignmentId: uuid })))
  .handler(({ data }) => record(backend().peer.mine(data)));

export const sendPeerReview = createServerFn({ method: "POST" })
  .validator(checked(peerReviewInputSchema))
  .handler(({ data }) => backend().peer.send(data));

export const commentInPeerReview = createServerFn({ method: "POST" })
  .validator(checked(peerCommentSchema))
  .handler(({ data }) => backend().peer.comment(data));

export const removePeerComment = createServerFn({ method: "POST" })
  .validator(checked(removePeerCommentSchema))
  .handler(({ data }) => backend().peer.uncomment(data));

export const ratePeerReview = createServerFn({ method: "POST" })
  .validator(checked(ratePeerReviewSchema))
  .handler(({ data }) => backend().peer.rate(data));
