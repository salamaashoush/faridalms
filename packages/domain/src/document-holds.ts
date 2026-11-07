/**
 * How long a hold on a document lasts without renewal: long enough to ride
 * out a missed renewal, short enough that a closed laptop frees it soon.
 */
export const HOLD_SECONDS = 90;

/** How often an open editor renews its hold, three times inside its lapse. */
export const HOLD_RENEW_SECONDS = 30;
