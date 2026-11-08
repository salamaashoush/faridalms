/**
 * When a provider will take the next request, as its own answers say. The
 * provider's quota is shared by every school this process serves, so one
 * gate holds them all; it opens at the reset the provider named, or after
 * the wait it asked for, never on a guess of ours.
 */
export class RateGate {
  private openAt = 0;

  /** Milliseconds before a request may go, none when the gate is open. */
  delay(now = Date.now()): number {
    return Math.max(0, this.openAt - now);
  }

  /** Holds requests until an instant the provider named. */
  holdUntil(at: number) {
    if (Number.isFinite(at)) this.openAt = Math.max(this.openAt, at);
  }

  /** Holds requests for as many seconds as the provider asked. */
  holdFor(seconds: number, now = Date.now()) {
    this.holdUntil(now + seconds * 1000);
  }
}

/** Waits, or rejects as soon as the request is abandoned. */
export function pause(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, milliseconds);
    const stop = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", stop, { once: true });
  });
}
