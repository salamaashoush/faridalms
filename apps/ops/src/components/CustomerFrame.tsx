import type { ReactNode } from "react";

import { AuthLayout } from "@faridalms/ui/system/auth-layout";
import { ThemeToggle } from "@faridalms/ui/system/theme-toggle";

export interface CustomerFrameProps {
  /** The business the customer deals with, in the page's language. */
  business: string;
  locale: "en" | "ar";
  children: ReactNode;
}

/**
 * A page a customer opens from a link: the business's name over the whole
 * width, in the customer's language and direction, with none of the
 * console around it.
 */
export function CustomerFrame({
  business,
  locale,
  children,
}: CustomerFrameProps) {
  return (
    <div dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>
      <AuthLayout
        wide
        mark={<span className="text-sm font-semibold">{business}</span>}
        tools={<ThemeToggle />}
      >
        <div className="mx-auto grid w-full max-w-3xl gap-8 py-8">
          {children}
        </div>
      </AuthLayout>
    </div>
  );
}
