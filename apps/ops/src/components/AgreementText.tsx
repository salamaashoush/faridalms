import { Marked } from "marked";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escape = (text: string) =>
  text.replaceAll(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

// The owner writes these, but they are shown to the public: raw HTML is
// shown as text, images as their words, and only web, mail and same-site
// links are kept.
const markdown = new Marked({
  gfm: true,
  renderer: {
    html: ({ text }) => escape(text),
    image: ({ text }) => escape(text),
    link({ href, tokens }) {
      const words = this.parser.parseInline(tokens);
      return /^(?:https?:|mailto:|\/(?!\/)|#)/i.test(href)
        ? `<a href="${escape(href)}" rel="noreferrer">${words}</a>`
        : words;
    },
  },
});

export interface AgreementTextProps {
  body: string;
  locale: "en" | "ar";
}

/** A published agreement's words, from its Markdown. */
export function AgreementText({ body, locale }: AgreementTextProps) {
  return (
    <div
      dir={locale === "ar" ? "rtl" : "ltr"}
      lang={locale}
      className="grid gap-3 text-[15px] leading-7 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_h1]:text-2xl [&_h1]:leading-9 [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:list-decimal [&_ol]:ps-6 [&_table]:w-full [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_ul]:list-disc [&_ul]:ps-6"
      dangerouslySetInnerHTML={{
        __html: markdown.parse(body, { async: false }),
      }}
    />
  );
}
