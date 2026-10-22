import type { JSX } from "react";

import { AppWindow, ExternalLink } from "lucide-react";

/** A link to an outside tool as its readers meet it: what it is, and a way in. */
export function LtiCard({
  title,
  tool,
  href,
  openLabel,
  children,
}: {
  title: string;
  tool?: string;
  href: string | null;
  openLabel: string;
  children?: JSX.Element | null;
}) {
  return (
    <div className="fe-lti">
      <span className="fe-lti-icon" aria-hidden>
        <AppWindow className="size-5" />
      </span>
      <div className="fe-lti-body">
        {children ?? (
          <span className="fe-lti-title" dir="auto">
            {title}
          </span>
        )}
        {tool && tool !== title ? (
          <span className="fe-lti-tool" dir="auto">
            {tool}
          </span>
        ) : null}
      </div>
      {href ? (
        <a
          className="fe-lti-open"
          href={href}
          target="_blank"
          rel="noopener"
          aria-label={`${openLabel}: ${title}`}
        >
          <ExternalLink aria-hidden className="size-4" />
          {openLabel}
        </a>
      ) : null}
    </div>
  );
}
