/**
 * Mail that comes back to a conversation: the reply address it carries,
 * whether a person or a machine sent it, and the words that are new in it.
 * Pure, so the inbound route and its tests read mail the same way.
 */

const TENANT = /^[0-9a-f]{32}$/;
const TOKEN = /^[a-z2-7]{26}$/;

/** How many characters a reply token has: 130 bits in lower-case base32. */
export const REPLY_TOKEN_LENGTH = 26;

/**
 * A conversation's reply address, `r+<tenant>.<token>@<domain>`: the tenant
 * routes the mail to its cell and school database (platform foundation 7.1),
 * the token names one outside participant's place in one conversation. No
 * record id appears in it.
 */
export function replyAddress(
  tenantId: string,
  token: string,
  domain: string,
): string {
  return `r+${tenantId.replaceAll("-", "")}.${token}@${domain}`;
}

/** The tenant and token of a reply address at this domain, or null for any other address. */
export function readReplyAddress(
  address: string,
  domain: string,
): { tenantId: string; token: string } | null {
  const at = address.lastIndexOf("@");
  if (at <= 0) return null;
  if (address.slice(at + 1).toLowerCase() !== domain.toLowerCase()) return null;
  const local = address.slice(0, at).toLowerCase();
  if (!local.startsWith("r+")) return null;
  const [hex, token, ...rest] = local.slice(2).split(".");
  if (rest.length || !hex || !token || !TENANT.test(hex) || !TOKEN.test(token))
    return null;
  const tenantId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { tenantId, token };
}

/** The bare address of a `From` or `To` value such as `Salama <s@example.com>`, lower case. */
export function mailboxAddress(value: string): string | null {
  const angled = /<([^<>\s]+@[^<>\s]+)>\s*$/.exec(value.trim());
  const bare = angled?.[1] ?? value.trim();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(bare)) return null;
  return bare.toLowerCase();
}

/** The address part after the `@`. */
export const domainOf = (address: string) =>
  address.slice(address.lastIndexOf("@") + 1).toLowerCase();

const AUTOMATED_SENDERS =
  /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounces?|auto-?reply)([+.-].*)?$/;

/**
 * Why a message was sent by a machine rather than a person, or null.
 * Answering a machine is how two of them mail each other forever, so mail
 * marked as automatic (RFC 3834's `Auto-Submitted`, the older `Precedence`
 * and vendor headers), a list's, a delivery report or a bounce never enters
 * a conversation. Header names are read in lower case.
 */
export function automatedReason(
  headers: Readonly<Record<string, string>>,
  from: string,
): string | null {
  const header = (name: string) => headers[name]?.trim().toLowerCase() ?? "";
  const submitted = header("auto-submitted");
  if (submitted && submitted !== "no") return "auto_submitted";
  if (["bulk", "junk", "list", "auto_reply"].includes(header("precedence")))
    return "precedence";
  if (
    header("x-autoreply") ||
    header("x-autorespond") ||
    header("x-autoresponder")
  )
    return "auto_reply";
  if (/\b(all|oof|autoreply)\b/.test(header("x-auto-response-suppress")))
    return "auto_reply";
  if (header("list-id") || header("list-unsubscribe")) return "list";
  if (
    header("return-path") === "<>" ||
    header("content-type").includes("report-type=delivery-status")
  )
    return "bounce";
  const local = from.slice(0, from.lastIndexOf("@")).toLowerCase();
  if (AUTOMATED_SENDERS.test(local)) return "automated_sender";
  return null;
}

/**
 * The line every email to a family starts with. A reply's new words are
 * above it, so everything from it down is what the family's mail program
 * quoted back.
 */
export const REPLY_MARKER = {
  en: "-- Please write your reply above this line --",
  ar: "-- يُرجى كتابة ردّكم فوق هذا السطر --",
} as const;

const MARKERS = Object.values(REPLY_MARKER);

/** Where a quoted earlier message begins, by the line each mail program writes above it. */
const QUOTE_HEADERS = [
  /^(on|le|am|el|il|op)\s.+(wrote|a écrit|schrieb|escribió|ha scritto|schreef)\s*:\s*$/i,
  /^في\s.+،\s*كتب(\s.*)?:\s*$/,
  /^-{2,}\s*(original message|forwarded message|الرسالة الأصلية|رسالة معاد توجيهها)\s*-{2,}\s*$/i,
  /^_{10,}\s*$/,
];
const OUTLOOK_FROM = /^\*?(from|من)\s*:\*?\s.+/i;
const OUTLOOK_NEXT =
  /^\*?(sent|date|to|subject|أُرسلت|التاريخ|إلى|الموضوع)\s*:/i;
const SIGNED_FROM_DEVICE =
  /^(sent from my .+|get outlook for .+|sent from (yahoo|mail) for .+|أُرسلت من .+|أرسلت من .+|مرسل من .+)$/i;

/**
 * The words a person added in a reply: their own text above whatever their
 * mail program quoted, without a signature block or a "sent from my phone"
 * line. When nothing is left the whole text is kept, so a reply written
 * below the quote is not lost.
 */
export function newContent(text: string): string {
  const lines = text
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n");
  let end = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const line = (lines[index] ?? "").trim();
    const unquoted = line.replace(/^(>\s*)+/, "");
    if (MARKERS.some((marker) => unquoted.includes(marker))) {
      end = index;
      break;
    }
    if (QUOTE_HEADERS.some((pattern) => pattern.test(line))) {
      end = index;
      break;
    }
    // A header that wraps puts "wrote:" on the next line.
    const next = (lines[index + 1] ?? "").trim();
    if (
      /^(on|le|am)\s/i.test(line) &&
      /(wrote|a écrit|schrieb)\s*:\s*$/i.test(next)
    ) {
      end = index;
      break;
    }
    if (
      OUTLOOK_FROM.test(line) &&
      lines
        .slice(index + 1, index + 5)
        .some((after) => OUTLOOK_NEXT.test(after.trim()))
    ) {
      end = index;
      break;
    }
    if (line === "--" || lines[index] === "-- ") {
      end = index;
      break;
    }
  }
  const kept = lines.slice(0, end);
  // A block of quoted lines that runs to the end is the earlier message.
  let last = kept.length;
  while (last > 0) {
    const line = (kept[last - 1] ?? "").trim();
    if (line === "" || line.startsWith(">") || SIGNED_FROM_DEVICE.test(line))
      last -= 1;
    else break;
  }
  const words = kept
    .slice(0, last)
    .map((line) => line.trimEnd())
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
  return words || text.trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Readable text from an HTML-only email: the quoted earlier message (a
 * `blockquote`, or the containers Gmail and Outlook put it in) and anything
 * that is not text are dropped, and blocks become lines.
 */
export function textOfHtml(html: string): string {
  let body = html.replaceAll(/<(style|script|head)[\s\S]*?<\/\1>/gi, "");
  const quote = body.search(
    /<blockquote|class="?gmail_quote|id="?(divRplyFwdMsg|appendonsend)|class="?yahoo_quoted/i,
  );
  if (quote >= 0) body = body.slice(0, body.lastIndexOf("<", quote));
  return body
    .replaceAll(/<br\s*\/?>/gi, "\n")
    .replaceAll(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replaceAll(/<[^>]+>/g, "")
    .replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
      if (name.startsWith("#x") || name.startsWith("#X"))
        return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
      if (name.startsWith("#"))
        return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Whether a received message passed the checks that its sender's domain
 * sent it: DMARC when the domain publishes a policy, otherwise DKIM or SPF.
 * A reply that claims the family's address without passing is held, since
 * that address is all that ties it to the family.
 */
export function senderAuthenticated(
  checks: { spf?: string; dkim?: string; dmarc?: string } | null | undefined,
): boolean {
  if (!checks) return false;
  const dmarc = checks.dmarc?.toLowerCase();
  if (dmarc === "pass") return true;
  if (dmarc === "fail") return false;
  return (
    checks.dkim?.toLowerCase() === "pass" ||
    checks.spf?.toLowerCase() === "pass"
  );
}
