import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { CSSProperties, ReactNode } from "react";

import { validContentStyle } from "@faridalms/domain/content";
import { isSafeContentUrl } from "@faridalms/domain/rich-text";

import * as m from "~/i18n/messages";

function textStyle(serialized = ""): CSSProperties {
  if (!validContentStyle(serialized)) return {};
  const result: CSSProperties = {};
  for (const entry of serialized.split(";")) {
    const [key, value] = entry.split(":").map((part) => part.trim());
    if (key === "color") result.color = value;
    if (key === "background-color") result.backgroundColor = value;
    if (key === "font-family") result.fontFamily = value;
    if (key === "font-size") result.fontSize = value;
  }
  return result;
}
function render(node: ContentNode, key: string): ReactNode {
  const children = node.children?.map((child, index) =>
    render(child, `${key}.${index}`),
  );
  const format = typeof node.format === "number" ? node.format : 0;
  const style: CSSProperties = {
    ...textStyle(node.style),
    textAlign:
      typeof node.format === "string" && node.format ? node.format : undefined,
    paddingInlineStart: node.indent ? `${node.indent * 1.5}rem` : undefined,
  };
  if (
    node.type === "text" ||
    node.type === "code-highlight" ||
    node.type === "tab"
  ) {
    let text: ReactNode = node.text;
    if (format & 1) text = <strong>{text}</strong>;
    if (format & 2) text = <em>{text}</em>;
    if (format & 4) text = <s>{text}</s>;
    if (format & 8) text = <u>{text}</u>;
    if (format & 16) text = <code>{text}</code>;
    if (format & 32) text = <sub>{text}</sub>;
    if (format & 64) text = <sup>{text}</sup>;
    return (
      <span key={key} style={style}>
        {text}
      </span>
    );
  }
  const props = { style, dir: node.direction ?? undefined };
  switch (node.type) {
    case "root":
      return (
        <div key={key} {...props}>
          {children}
        </div>
      );
    case "paragraph":
      return (
        <p key={key} {...props}>
          {children?.length ? children : <br />}
        </p>
      );
    case "heading": {
      const Heading =
        node.tag === "h1"
          ? "h2"
          : node.tag === "h2"
            ? "h3"
            : node.tag === "h3"
              ? "h4"
              : "h5";
      return (
        <Heading key={key} {...props}>
          {children}
        </Heading>
      );
    }
    case "quote":
      return (
        <blockquote key={key} {...props}>
          {children}
        </blockquote>
      );
    case "code":
      return (
        <pre key={key} {...props}>
          <code>{children}</code>
        </pre>
      );
    case "linebreak":
      return <br key={key} />;
    case "horizontalrule":
      return <hr key={key} />;
    case "list":
      return node.listType === "number" ? (
        <ol key={key} {...props} start={node.start}>
          {children}
        </ol>
      ) : (
        <ul
          key={key}
          {...props}
          className={node.listType === "check" ? "list-none ps-0" : undefined}
        >
          {children}
        </ul>
      );
    case "listitem":
      return (
        <li key={key} {...props} value={node.value}>
          {node.checked !== undefined ? (
            <input
              type="checkbox"
              checked={node.checked}
              readOnly
              disabled
              aria-label={m.contentChecklist()}
              className="me-2"
            />
          ) : null}
          {children}
        </li>
      );
    case "link":
    case "autolink":
      return node.url && isSafeContentUrl(node.url) ? (
        <a
          key={key}
          href={node.url}
          title={node.title ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      ) : (
        <span key={key}>{children}</span>
      );
    case "table":
      return (
        <div key={key} className="my-5 overflow-x-auto">
          <table className="w-full border-collapse">
            <tbody>{children}</tbody>
          </table>
        </div>
      );
    case "tablerow":
      return (
        <tr key={key} {...props}>
          {children}
        </tr>
      );
    case "tablecell": {
      const Cell = node.headerState ? "th" : "td";
      return (
        <Cell
          key={key}
          {...props}
          colSpan={node.colSpan}
          rowSpan={node.rowSpan}
          className="border border-border p-3 text-start"
          style={{
            ...style,
            verticalAlign: node.verticalAlign,
            backgroundColor: node.backgroundColor ?? undefined,
          }}
        >
          {children}
        </Cell>
      );
    }
  }
  return null;
}
export function ContentView({ document }: { document: ContentDocument }) {
  return (
    <div className="prose prose-sm max-w-none break-words dark:prose-invert">
      {render(document.root, "root")}
    </div>
  );
}
