/**
 * The client's address from `X-Forwarded-For`: the entry the outermost trusted
 * proxy added, counted from the right. Anything left of it was sent by the
 * client and can say anything. Fewer entries than trusted hops means the
 * request skipped a proxy, so no address is trusted.
 */
export function clientAddress(
  forwardedFor: string | null | undefined,
  trustedHops: number,
): string | null {
  const entries = (forwardedFor ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (trustedHops < 1 || entries.length < trustedHops) return null;
  return entries.at(-trustedHops) ?? null;
}
