const ATTEMPTS = 4;

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
    const wait = Number(response.headers.get("retry-after")) || attempt * 2;
    await Bun.sleep(wait * 1000);
  }
}
