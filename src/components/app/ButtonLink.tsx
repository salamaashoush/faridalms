import type { LinkProps } from "@tanstack/react-router";
import type { VariantProps } from "class-variance-authority";
import type { ReactNode } from "react";

import { Link } from "@tanstack/react-router";

import { buttonVariants } from "~/components/ui/button";
import { cn } from "~/utils/cn";

type ButtonLinkProps = LinkProps &
  VariantProps<typeof buttonVariants> & {
    className?: string;
    children: ReactNode;
  };

/**
 * A link that looks like a button.
 *
 * Not `<Button render={<Link/>}/>`: Base UI's button assumes a native
 * `<button>` and warns when it is handed an anchor. A control that navigates
 * is a link, so it stays one and only borrows the styling.
 */
export function ButtonLink({
  variant,
  size,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      {...props}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {children}
    </Link>
  );
}
