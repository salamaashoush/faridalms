import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { ActionItem } from "./action-menu";

import { Button } from "../button";
import { ActionMenu } from "./action-menu";
import { ButtonLink } from "./button-link";
import { PageActions } from "./page-actions";
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
  /**
   * How the page's work stands, before its actions: whether what was typed
   * is saved, as a page edited in place says ("Saving…", "Saved").
   */
  status?: ReactNode;
}

/**
 * A list's, a form's or settings' header, which is the top bar: the
 * breadcrumb already names the page, so the title is the page's heading
 * for screen readers alone, the count stands beside the breadcrumb, and the
 * status, menu and action sit at the bar's end. Only the description takes
 * room on the page, one line above its content.
 */
export function PageHeader({
  title,
  count,
  description,
  action,
  menu = NO_ACTIONS,
  status,
}: PageHeaderProps) {
  const { strings, formatNumber } = useDesignSystem();
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      <PageActions
        meta={
          count === undefined ? undefined : (
            <p className="text-sm text-muted-foreground tabular-nums">
              <span aria-hidden>{formatNumber(count)}</span>
              <span className="sr-only">
                {strings.countInTotal(formatNumber(count))}
              </span>
            </p>
          )
        }
      >
        {action || menu.length || status ? (
          <div data-keeps-global-tools className="flex items-center gap-2">
            {status}
            <ActionMenu
              label={strings.moreActions}
              actions={menu}
              size="icon"
              className="max-md:size-10"
            />
            {action ? <HeaderActionButton action={action} /> : null}
          </div>
        ) : null}
      </PageActions>
      {description ? (
        <p className="mb-4 text-[13px] leading-[18px] text-muted-foreground">
          {description}
        </p>
      ) : null}
    </>
  );
}

interface HeaderActionButtonProps {
  action: HeaderAction;
}

function HeaderActionButton({ action }: HeaderActionButtonProps) {
  // A phone's bar also holds search and notifications, so an action with
  // an icon shows the icon alone there.
  const content = (
    <>
      {action.icon ? <action.icon aria-hidden /> : null}
      <span className={action.icon ? "max-sm:sr-only" : undefined}>
        {action.label}
      </span>
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
