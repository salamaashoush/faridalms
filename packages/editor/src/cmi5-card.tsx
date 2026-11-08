import type { Cmi5Package } from "@faridalms/domain/cmi5";

import { ExternalLink, PackageOpen } from "lucide-react";

export interface Cmi5CardProps {
  course: Cmi5Package;
  /** Where each unit launches by its place; none in the editor or before saving. */
  href: ((index: number) => string | null) | null;
  startLabel: string;
  /** What the units are called above their list. */
  unitsLabel: string;
}

/**
 * A course package as its readers meet it: the course, and each of its
 * units with a way to start it in a window of its own, as cmi5 launches
 * an AU.
 */
export function Cmi5Card({
  course,
  href,
  startLabel,
  unitsLabel,
}: Cmi5CardProps) {
  return (
    <section className="fe-cmi5" aria-label={course.title || unitsLabel}>
      <div className="fe-lti">
        <span className="fe-lti-icon" aria-hidden>
          <PackageOpen className="size-5" />
        </span>
        <div className="fe-lti-body">
          <span className="fe-lti-title" dir="auto">
            {course.title}
          </span>
          <span className="fe-lti-tool">{unitsLabel}</span>
        </div>
      </div>
      <ol className="fe-cmi5-units">
        {course.aus.map((au, index) => {
          const to = href?.(index) ?? null;
          return (
            <li key={`${au.id}-${index}`} className="fe-cmi5-unit">
              <span dir="auto" className="fe-cmi5-unit-title">
                {au.title || au.id}
              </span>
              {to ? (
                <a
                  className="fe-lti-open"
                  href={to}
                  target="_blank"
                  rel="noopener"
                  aria-label={`${startLabel}: ${au.title || au.id}`}
                >
                  <ExternalLink aria-hidden className="size-4" />
                  {startLabel}
                </a>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
