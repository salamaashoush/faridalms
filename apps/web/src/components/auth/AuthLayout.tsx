import type { ReactNode } from "react";

import { BookOpen, GraduationCap, Languages, Users } from "lucide-react";

import { LocaleToggle } from "~/components/theme/LocaleToggle";
import { ThemeToggle } from "~/components/theme/ThemeToggle";
import * as m from "~/i18n/messages";

export function AuthLayout({ children }: { children: ReactNode }) {
  const features = [
    {
      icon: BookOpen,
      title: m.authFeatureLearning(),
      body: m.authFeatureLearningBody(),
    },
    {
      icon: Users,
      title: m.authFeatureCommunity(),
      body: m.authFeatureCommunityBody(),
    },
    {
      icon: Languages,
      title: m.authFeatureLanguage(),
      body: m.authFeatureLanguageBody(),
    },
  ];
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="school-sidebar relative hidden overflow-hidden p-12 lg:flex lg:flex-col xl:p-16">
        <div className="flex items-center gap-3 text-lg font-semibold">
          <GraduationCap className="size-8" aria-hidden />
          {m.appName()}
        </div>
        <div className="relative z-10 my-auto max-w-lg py-16">
          <p className="mb-5 text-xs font-medium tracking-[0.2em] text-[#c7d9b8] uppercase">
            {m.workspaceLabel()}
          </p>
          <h2 className="text-5xl leading-[1.15] font-medium tracking-tight xl:text-6xl">
            {m.authBrandHeading()}
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-[#bcd2c8]">
            {m.authBrandBody()}
          </p>
          <div className="mt-12 space-y-7">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/5">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-medium">{title}</h3>
                  <p className="mt-1 text-sm text-[#bcd2c8]">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div
          className="pointer-events-none absolute -end-40 -bottom-56 size-[520px] rounded-full border-[80px] border-white/[0.03]"
          aria-hidden
        />
        <p className="text-xs text-[#bcd2c8]">
          {m.commonCopyRights({ year: new Date().getFullYear() })}
        </p>
      </div>
      <div className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between p-5 sm:p-8">
          <span className="flex items-center gap-2 font-semibold text-primary lg:invisible">
            <GraduationCap className="size-6" aria-hidden />
            {m.appName()}
          </span>
          <div className="flex gap-1">
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>
        <p className="p-6 text-center text-xs text-muted-foreground">
          {m.authFeatureLanguageBody()}
        </p>
      </div>
    </div>
  );
}
