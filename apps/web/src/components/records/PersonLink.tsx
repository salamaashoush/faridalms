import { Link } from "@tanstack/react-router";

import { cn } from "~/utils/cn";

export function PersonLink({
  person,
  className,
}: {
  person: { id: string; name: string };
  className?: string;
}) {
  return (
    <Link
      to="/people/$userId"
      params={{ userId: person.id }}
      className={cn(
        "font-medium text-foreground hover:text-primary hover:underline",
        className,
      )}
    >
      {person.name}
    </Link>
  );
}
