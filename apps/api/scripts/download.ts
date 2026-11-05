const ATTEMPTS = 6;

/**
 * Fetches what install vendors, asking again while the host answers with a
 * server error or asks to slow down: one 504 from a release host otherwise
 * fails a whole image build.
 */
export async function download(url: string): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) return response;
    if (
      attempt === ATTEMPTS ||
      (response.status < 500 && response.status !== 429)
    )
      throw new Error(`${url} answered ${response.status}`);
    // Doubling from two seconds waits about a minute in all, which a release
    // host's 504s have outlasted at a quarter of that.
    const wait = Number(response.headers.get("retry-after")) || 2 ** attempt;
    await Bun.sleep(wait * 1000);
  }
}
