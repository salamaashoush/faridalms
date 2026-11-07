import type { AuthBandContent } from "@faridalms/ui/system/auth-layout";
import type { ReactNode } from "react";

import { AuthHeading, AuthLayout } from "@faridalms/ui/system/auth-layout";
import { ThemeToggle } from "@faridalms/ui/system/theme-toggle";
import { HandCoins, School, ShieldCheck, Target } from "lucide-react";

const BAND: AuthBandContent = {
  eyebrow: "Operator console",
  heading: "Every school, in one place.",
  body: "Set schools up, sell and bill them, and keep them running, with a reason kept for every change.",
  features: [
    {
      icon: School,
      title: "Schools",
      body: "Set a school up step by step, then follow its onboarding, health and use.",
    },
    {
      icon: Target,
      title: "Sales",
      body: "Leads, quotes in English and Arabic, and the customers they become.",
    },
    {
      icon: HandCoins,
      title: "Billing",
      body: "Subscriptions, invoices and payments, and the reminders that follow them.",
    },
  ],
};

/** The console's mark, in whatever colour it sits on. */
function ConsoleMark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-md border border-current/20 bg-current/10">
        <ShieldCheck className="size-4" aria-hidden />
      </span>
      <span className="grid leading-tight">
        <span className="text-sm font-semibold">Farida</span>
        <span className="text-xs opacity-75">Operations</span>
      </span>
    </span>
  );
}

export interface AuthPageProps {
  title: string;
  lead: string;
  children?: ReactNode;
}

/** A page outside the console's frame: signing in, or waiting for a role. */
export function AuthPage({ title, lead, children }: AuthPageProps) {
  return (
    <AuthLayout mark={<ConsoleMark />} band={BAND} tools={<ThemeToggle />}>
      <AuthHeading title={title} lead={lead} />
      {children ? <div className="grid gap-4">{children}</div> : null}
    </AuthLayout>
  );
}
