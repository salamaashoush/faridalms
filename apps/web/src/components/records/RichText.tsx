import type {
  RichTextDocument,
  RichTextNode,
} from "@faridalms/domain/rich-text";
import type { ReactNode } from "react";

import { isSafeContentUrl } from "@faridalms/domain/rich-text";

function renderNode(node: RichTextNode, key: string): ReactNode {
  const content = node.content?.map((child, index) =>
    renderNode(child, `${key}.${index}`),
  );
  if (node.type === "text") {
    let text: ReactNode = node.text;
    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case "bold":
          text = <strong>{text}</strong>;
          break;
        case "italic":
          text = <em>{text}</em>;
          break;
        case "underline":
          text = <u>{text}</u>;
          break;
        case "strike":
          text = <s>{text}</s>;
          break;
        case "code":
          text = <code>{text}</code>;
          break;
        case "link":
          if (isSafeContentUrl(mark.attrs.href))
            text = (
              <a
                href={mark.attrs.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                {text}
              </a>
            );
          break;
      }
    }
    return <span key={key}>{text}</span>;
  }
  switch (node.type) {
    case "paragraph":
      return <p key={key}>{content?.length ? content : <br />}</p>;
    case "heading":
      return node.attrs?.level === 1 ? (
        <h2 key={key}>{content}</h2>
      ) : node.attrs?.level === 2 ? (
        <h3 key={key}>{content}</h3>
      ) : (
        <h4 key={key}>{content}</h4>
      );
    case "blockquote":
      return <blockquote key={key}>{content}</blockquote>;
    case "bulletList":
      return <ul key={key}>{content}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={node.attrs?.start}>
          {content}
        </ol>
      );
    case "listItem":
      return <li key={key}>{content}</li>;
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
  }
  return null;
}
export function RichText({ document }: { document: RichTextDocument }) {
  return (
    <div
      className="prose prose-sm max-w-none break-words dark:prose-invert"
      dir="auto"
    >
      {document.content.map((node, index) => renderNode(node, String(index)))}
    </div>
  );
}
