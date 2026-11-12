import { queryOptions } from "@tanstack/react-query";

import {
  getMyPeerReviews,
  getPeerOverview,
  getPeerSettings,
} from "~/server/peer";

/** How an assignment's work is reviewed by classmates; null where it is not. */
export const peerSettingsQuery = (assignmentId: string) =>
  queryOptions({
    queryKey: ["peer", "settings", assignmentId],
    queryFn: () => getPeerSettings({ data: { assignmentId } }),
  });

export const peerOverviewQuery = (assignmentId: string) =>
  queryOptions({
    queryKey: ["peer", "overview", assignmentId],
    queryFn: () => getPeerOverview({ data: { assignmentId } }),
  });

export const myPeerReviewsQuery = (assignmentId: string) =>
  queryOptions({
    queryKey: ["peer", "mine", assignmentId],
    queryFn: () => getMyPeerReviews({ data: { assignmentId } }),
  });
