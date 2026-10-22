import * as v from "valibot";

/** What a footnote cites: a book, an article in a journal, or a page on the web. */
export const SOURCE_KINDS = ["book", "article", "web"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** The styles schools and universities ask for: APA 7, MLA 9 and Chicago's notes. */
export const CITATION_STYLES = ["apa", "mla", "chicago"] as const;
export type CitationStyle = (typeof CITATION_STYLES)[number];

const field = (max: number) => v.pipe(v.string(), v.maxLength(max));

/**
 * A source as its reader writes it in: authors as "Last, First", one to a
 * semicolon; the date as a year or a full date, YYYY-MM-DD.
 */
export const footnoteSourceSchema = v.object({
  kind: v.picklist(SOURCE_KINDS),
  style: v.picklist(CITATION_STYLES),
  authors: field(300),
  title: field(300),
  /** The publisher of a book, the journal of an article, the site of a page. */
  container: field(200),
  date: v.pipe(v.string(), v.regex(/^(?:\d{4}(?:-\d{2}-\d{2})?)?$/u)),
  volume: field(20),
  issue: field(20),
  pages: field(40),
  url: field(500),
});
export type FootnoteSource = v.InferOutput<typeof footnoteSourceSchema>;

/** A piece of a formatted citation, set in italics where the style asks. */
export interface CitationRun {
  text: string;
  italic?: boolean;
}

interface Name {
  last: string;
  first: string;
}

function namesOf(authors: string): Name[] {
  return authors
    .split(/[;؛]/u)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => {
      const [last = "", first = ""] = name
        .split(/[,،]/u)
        .map((part) => part.trim());
      return { last, first };
    });
}

const initials = (first: string) =>
  first
    .split(/[\s-]+/u)
    .filter(Boolean)
    .map((part) => `${part[0]}.`)
    .join(" ");

/** Joins names as a list reads: a and b; a, b, and c. */
function listed(names: string[], and: string, comma = true): string {
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}${comma ? "," : ""} ${and} ${names.at(-1)}`;
}

function apaAuthors(names: Name[]): string {
  const written = names.map(({ last, first }) =>
    first ? `${last}, ${initials(first)}` : last,
  );
  if (written.length <= 1) return written.join("");
  if (written.length === 2) return `${written[0]}, & ${written[1]}`;
  return `${written.slice(0, -1).join(", ")}, & ${written.at(-1)}`;
}

function mlaAuthors(names: Name[]): string {
  const [first, second] = names;
  if (!first) return "";
  const lead = first.first ? `${first.last}, ${first.first}` : first.last;
  if (names.length === 1) return lead;
  if (names.length === 2 && second)
    return `${lead}, and ${[second.first, second.last].filter(Boolean).join(" ")}`;
  return `${lead}, et al`;
}

function chicagoAuthors(names: Name[]): string {
  const written = names.map(({ last, first }) =>
    [first, last].filter(Boolean).join(" "),
  );
  if (written.length > 3) return `${written[0]} et al.`;
  return listed(written, "and");
}

/** A date in a citation: the year alone, or the day, month and year in a style's order. */
function dated(date: string, order: "apa" | "mla" | "chicago", locale: string) {
  const [year = "", month, day] = date.split("-");
  if (!month || !day) return year;
  const when = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const monthName = new Intl.DateTimeFormat(locale, {
    month: order === "mla" ? "short" : "long",
    timeZone: "UTC",
  }).format(when);
  const dayNumber = String(Number(day));
  if (order === "apa") return `${year}, ${monthName} ${dayNumber}`;
  if (order === "mla") return `${dayNumber} ${monthName} ${year}`;
  return `${monthName} ${dayNumber}, ${year}`;
}

const ended = (text: string) => (/[.?!]$/u.test(text) ? text : `${text}.`);
/** What follows an italic title: its own stop when it has one, else a plain one. */
const after = (text: string) => (/[.?!]$/u.test(text) ? " " : ". ");

/**
 * A source formatted in its style: APA 7 and MLA 9 as their reference
 * lists give it, Chicago as a note. Missing parts are left out rather than
 * guessed, so a teacher sees what is still to fill in.
 */
export function formatSource(
  source: FootnoteSource,
  locale = "en",
): CitationRun[] {
  const names = namesOf(source.authors);
  const runs: CitationRun[] = [];
  const add = (text: string, italic = false) => {
    if (text) runs.push(italic ? { text, italic } : { text });
  };
  const year = source.date.slice(0, 4);
  const pages = source.pages.trim();
  if (source.style === "apa") {
    const who = apaAuthors(names);
    add(who ? `${ended(who)} ` : "");
    add(source.date ? `(${dated(source.date, "apa", locale)}). ` : "(n.d.). ");
    if (source.kind === "article") {
      add(source.title ? `${ended(source.title)} ` : "");
      add(source.container, true);
      add(source.volume ? `, ${source.volume}` : "", true);
      add(source.issue ? `(${source.issue})` : "");
      add(pages ? `, ${pages}` : "");
      add(source.container ? ". " : "");
    } else {
      add(source.title, true);
      add(source.title ? after(source.title) : "");
      add(source.container ? `${ended(source.container)} ` : "");
    }
    add(source.url);
  } else if (source.style === "mla") {
    const who = mlaAuthors(names);
    add(who ? `${ended(who)} ` : "");
    if (source.kind === "book") {
      add(source.title, true);
      add(source.title ? after(source.title) : "");
      add(
        [source.container, year].filter(Boolean).join(", ") +
          (source.container || year ? ". " : ""),
      );
    } else {
      add(source.title ? `“${ended(source.title)}” ` : "");
      add(source.container, true);
      const rest = [
        source.volume ? `vol. ${source.volume}` : "",
        source.issue ? `no. ${source.issue}` : "",
        source.date ? dated(source.date, "mla", locale) : "",
        pages ? `pp. ${pages}` : "",
        source.url,
      ].filter(Boolean);
      add(
        rest.length > 0 ? `, ${rest.join(", ")}.` : source.container ? "." : "",
      );
    }
  } else {
    const who = chicagoAuthors(names);
    add(who ? `${who}, ` : "");
    if (source.kind === "book") {
      add(source.title, true);
      const facts = [source.container, year].filter(Boolean).join(", ");
      add(facts ? ` (${facts})` : "");
      add(pages ? `, ${pages}` : "");
      add(".");
    } else {
      add(source.title ? `“${source.title},” ` : "");
      add(source.container, source.kind === "article");
      add(source.volume ? ` ${source.volume}` : "");
      add(source.issue ? `, no. ${source.issue}` : "");
      const when = source.date ? dated(source.date, "chicago", locale) : "";
      add(when ? (source.kind === "article" ? ` (${year})` : `, ${when}`) : "");
      add(pages ? `: ${pages}` : "");
      add(source.url ? `, ${source.url}` : "");
      add(".");
    }
  }
  return runs;
}

/** A formatted citation as plain words, for searching and copying. */
export const sourceText = (source: FootnoteSource, locale = "en") =>
  formatSource(source, locale)
    .map((run) => run.text)
    .join("")
    .trim();
