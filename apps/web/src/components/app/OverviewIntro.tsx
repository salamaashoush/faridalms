import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen } from "lucide-react";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

import { NAVIGATION } from "./navigation";

export function OverviewIntro() {
  const user = useCurrentUser();
  const copy = {
    admin: [m.welcomeAdmin(), m.welcomeAdminBody()],
    teach: [m.welcomeTeacher(), m.welcomeTeacherBody()],
    family: [m.welcomeParent(), m.welcomeParentBody()],
    me: [m.welcomeStudent(), m.welcomeStudentBody()],
  }[user.workspace];
  const links = NAVIGATION[user.workspace]
    .flatMap((section) => section.items)
    .filter((item) => !item.exact)
    .slice(0, 3);

  return (
    <section
      className="workspace-hero relative mb-7 overflow-hidden rounded-2xl border border-primary/10 p-6 sm:p-8"
      aria-label={m.workspaceQuickLinks()}
    >
      <div
        className="hero-grid pointer-events-none absolute inset-y-0 end-0 w-2/5 opacity-70"
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-6">
        <div className="max-w-xl">
          <p className="mb-3 text-xs font-semibold tracking-widest uppercase opacity-70">
            {m.workspaceToday()}
          </p>
          <h2 className="max-w-md text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
            {copy[0]}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed opacity-80">
            {copy[1]}
          </p>
        </div>
        <div
          className="hidden size-28 shrink-0 -rotate-6 items-center justify-center rounded-3xl border border-primary/10 bg-background/60 shadow-sm sm:flex"
          aria-hidden
        >
          <BookOpen className="size-14 stroke-[1.2]" />
        </div>
      </div>
      <div className="relative mt-6 flex flex-wrap gap-2">
        {links.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className="inline-flex items-center gap-3 rounded-lg border border-primary/15 bg-background/80 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-background focus-visible:outline-2 focus-visible:outline-ring"
          >
            {label()}
            <ArrowUpRight className="size-4 rtl:-rotate-90" aria-hidden />
          </Link>
        ))}
      </div>
    </section>
  );
}
