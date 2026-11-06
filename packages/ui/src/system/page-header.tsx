import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import type { ActionItem } from "./action-menu";

import { Button } from "../button";
import { ActionMenu } from "./action-menu";
import { ButtonLink } from "./button-link";
import { useDesignSystem } from "./provider";

const NO_ACTIONS: ActionItem[] = [];

interface HeaderActionBase {
  label: string;
  icon?: LucideIcon;
}

interface HeaderButtonAction extends HeaderActionBase {
  onClick: () => void;
}

interface HeaderLinkAction extends HeaderActionBase {
  link: LinkProps;
}

/** The page's one primary action: a button, or a link to where it happens. */
export type HeaderAction = HeaderButtonAction | HeaderLinkAction;

export interface PageHeaderProps {
  title: string;
  /** The size of the list, beside the title in muted text. */
  count?: number;
  description?: string;
  action?: HeaderAction;
  menu?: ActionItem[];
}

export function PageHeader({
  title,
  count,
  description,
  action,
  menu = NO_ACTIONS,
}: PageHeaderProps) {
  const { strings, formatNumber } = useDesignSystem();
  // The action shares the title's line and the description runs beneath
  // both, so on a phone a long description never pushes the action onto a
  // row of its own.
  return (
    <header className="mb-6 grid gap-1">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-h-9 min-w-0 items-center gap-2 max-md:min-h-10">
          <h1 className="text-2xl leading-8 font-semibold tracking-tight">
            {title}
          </h1>
          {count === undefined ? null : (
            <p className="text-2xl leading-8 text-muted-foreground tabular-nums">
              <span aria-hidden>{formatNumber(count)}</span>
              <span className="sr-only">
                {strings.countInTotal(formatNumber(count))}
              </span>
            </p>
          )}
        </div>
        {action || menu.length ? (
          <div className="flex shrink-0 items-center gap-2">
            <ActionMenu
              label={strings.moreActions}
              actions={menu}
              size="icon"
              className="max-md:size-10"
            />
            {action ? <HeaderActionButton action={action} /> : null}
          </div>
        ) : null}
      </div>
      {description ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  );
}

interface HeaderActionButtonProps {
  action: HeaderAction;
}

function HeaderActionButton({ action }: HeaderActionButtonProps) {
  const content = (
    <>
      {action.icon ? <action.icon aria-hidden /> : null}
      {action.label}
    </>
  );
  return "link" in action ? (
    <ButtonLink {...action.link} className="max-md:h-10">
      {content}
    </ButtonLink>
  ) : (
    <Button type="button" className="max-md:h-10" onClick={action.onClick}>
      {content}
    </Button>
  );
}
