import type { ReactNode } from "react";

import { Link } from "@tanstack/react-router";

/** How far the server says the viewer reaches someone whose name is shown. */
export type RecordLink = "student" | "person" | "profile" | null;

/**
 * A person's name as a link to as much of them as the viewer reaches: a
 * student's record, a person's record or their limited profile. With no
 * reach it is the name alone.
 */
export function PersonLink({
  userId,
  link,
  className,
  children,
}: {
  userId: string | null;
  link: RecordLink;
  className?: string;
  children: ReactNode;
}) {
  if (!userId || !link) return <>{children}</>;
  if (link === "student")
    return (
      <Link
        to="/students/$studentId"
        params={{ studentId: userId }}
        className={className}
      >
        {children}
      </Link>
    );
  return (
    <Link
      to={link === "person" ? "/people/$userId" : "/profiles/$userId"}
      params={{ userId }}
      className={className}
    >
      {children}
    </Link>
  );
}
