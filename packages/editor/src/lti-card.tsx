import type { JSX } from "react";

import { AppWindow, ExternalLink } from "lucide-react";

export interface LtiCardProps {
  title: string;
  tool?: string;
  href: string | null;
  openLabel: string;
  /** A word beside the tool's name, such as that it shows in the page. */
  note?: string;
  children?: JSX.Element | null;
}

/** A link to an outside tool as its readers meet it: what it is, and a way in. */
export function LtiCard({
  title,
  tool,
  href,
  openLabel,
  note,
  children,
}: LtiCardProps) {
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
        {(tool && tool !== title) || note ? (
          <span className="fe-lti-tool" dir="auto">
            {[tool !== title ? tool : null, note].filter(Boolean).join(" · ")}
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
