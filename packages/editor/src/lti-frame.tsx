import { LtiCard } from "./lti-card";

export interface LtiFrameProps {
  title: string;
  /** Where the link launches; the frame launches it shown in the page. */
  href: string;
  height: number;
  openLabel: string;
}

/**
 * A tool shown in the page: launched in a frame as it would be in a
 * window, with the card above it to open it in a window instead, for a
 * tool that will not run in a frame.
 */
export function LtiFrame({ title, href, height, openLabel }: LtiFrameProps) {
  const framed = `${href}${href.includes("?") ? "&" : "?"}frame=1`;
  return (
    <div className="fe-lti-framed">
      <LtiCard title={title} href={href} openLabel={openLabel} />
      <iframe
        className="fe-lti-frame"
        src={framed}
        title={title}
        style={{ height }}
        allow="fullscreen; clipboard-write"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads"
      />
    </div>
  );
}
