import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ChevronDown, ListFilter, Search, SearchX, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { ButtonLink } from "~/components/app/ButtonLink";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";
import { formatNumber } from "~/utils/datetime";

import type { ActionItem } from "./ActionMenu";

import { ActionMenu, phoneMenuItem } from "./ActionMenu";

const NO_ACTIONS: ActionItem[] = [];
const NO_FACETS: Facet[] = [];

export type HeaderAction = { label: string; icon?: LucideIcon } & (
  | { onClick: () => void }
  | { link: LinkProps }
);

export function PageHeader({
  title,
  count,
  description,
  action,
  menu = NO_ACTIONS,
}: {
  title: string;
  count?: number;
  description?: string;
  action?: HeaderAction;
  menu?: ActionItem[];
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <div className="flex min-h-9 items-center gap-2 max-md:min-h-10">
          <h1 className="text-2xl leading-8 font-semibold tracking-tight">
            {title}
          </h1>
          {count === undefined ? null : (
            <p className="text-2xl leading-8 text-muted-foreground tabular-nums">
              <span aria-hidden>{formatNumber(count)}</span>
              <span className="sr-only">
                {m.indexCountLabel({ count: formatNumber(count) })}
              </span>
            </p>
          )}
        </div>
        {description ? (
          <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action || menu.length ? (
        <div className="flex shrink-0 items-center gap-2">
          <ActionMenu
            label={m.docMoreActions()}
            actions={menu}
            size="icon"
            className="max-md:size-10"
          />
          {action ? <HeaderActionButton action={action} /> : null}
        </div>
      ) : null}
    </header>
  );
}

function HeaderActionButton({ action }: { action: HeaderAction }) {
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

export interface FacetOption {
  value: string;
  label: string;
  count?: number;
  /** Shown where a count would be when there is no count to give. */
  hint?: string;
}

export interface Facet {
  id: string;
  label: string;
  options: FacetOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** One value at a time, as with the school year. */
  single?: boolean;
  /**
   * The unfiltered selection. A facet that always holds a value, such as the
   * school year, names it here.
   */
  defaultSelected?: string[];
}

export interface IndexToolbarProps {
  search?: {
    value: string;
    onChange: (value: string) => void;
    label: string;
    placeholder?: string;
  };
  facets?: Facet[];
  onReset?: () => void;
}

function sameSelection(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function facetActive(facet: Facet) {
  return !sameSelection(facet.selected, facet.defaultSelected ?? []);
}

export function isFiltered({ search, facets = [] }: IndexToolbarProps) {
  return Boolean(search?.value) || facets.some(facetActive);
}

export function IndexToolbar({
  search,
  facets = NO_FACETS,
  onReset,
  view,
}: IndexToolbarProps & { view?: ReactNode }) {
  const filtered = isFiltered({ search, facets });
  return (
    <search
      aria-label={m.indexToolbar()}
      className="flex min-h-8 flex-wrap items-center gap-2"
    >
      {search ? <SearchInput {...search} /> : null}
      {facets.length ? (
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          {facets.slice(0, 3).map((facet) => (
            <FacetFilter key={facet.id} facet={facet} />
          ))}
        </div>
      ) : null}
      {facets.length ? (
        <FilterSheet
          facets={facets.slice(0, 3)}
          onReset={filtered ? onReset : undefined}
        />
      ) : null}
      {filtered && onReset ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={m.indexReset()}
          className="text-muted-foreground max-md:size-10"
          onClick={onReset}
        >
          <span className="hidden md:inline">{m.indexReset()}</span>
          <X aria-hidden />
        </Button>
      ) : null}
      {view ? <div className="ms-auto flex items-center">{view}</div> : null}
    </search>
  );
}

/**
 * The query lives in the URL, but a keystroke should not wait for a round
 * trip, so the input keeps a draft and hands it on after a pause. An outside
 * change (Reset, Back) replaces the draft; its own echo does not.
 */
function SearchInput({
  value,
  onChange,
  label,
  placeholder,
}: NonNullable<IndexToolbarProps["search"]>) {
  const [draft, setDraft] = useState(value);
  const [sent, setSent] = useState(value);
  const [seen, setSeen] = useState(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  if (value !== seen) {
    setSeen(value);
    if (value !== sent) {
      setSent(value);
      setDraft(value);
    }
  }
  useEffect(() => {
    const timer =
      draft === sent
        ? undefined
        : setTimeout(() => {
            setSent(draft);
            onChangeRef.current(draft);
          }, 250);
    return () => clearTimeout(timer);
  }, [draft, sent]);
  return (
    <div className="relative min-w-0 flex-1 md:max-w-60 md:basis-44">
      <Search
        className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label={label}
        placeholder={placeholder ?? label}
        // Orders a Latin query left to right in the Arabic UI. dir="auto" would
        // also flip the padding and let the text run under the search icon.
        className="h-8 bg-background ps-8 [unicode-bidi:plaintext] max-md:h-10"
      />
    </div>
  );
}

function selectedLabels(facet: Facet) {
  return facet.options
    .filter((option) => facet.selected.includes(option.value))
    .map((option) => option.label);
}

function OptionMeta({ option }: { option: FacetOption }) {
  if (option.count !== undefined)
    return (
      <span className="ms-auto ps-4 text-[13px] leading-[18px] text-muted-foreground tabular-nums">
        {formatNumber(option.count)}
      </span>
    );
  if (option.hint)
    return (
      <span className="ms-auto ps-4 text-[13px] leading-[18px] text-muted-foreground">
        {option.hint}
      </span>
    );
  return null;
}

function FacetFilter({ facet }: { facet: Facet }) {
  const labels = selectedLabels(facet);
  const active = facetActive(facet);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "max-w-72 min-w-0 font-normal",
              labels.length === 0 && "border-dashed",
            )}
          />
        }
      >
        <span className="font-medium">{facet.label}</span>
        {labels.length ? (
          <>
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
            {labels.length > 2 ? (
              <span className="rounded-sm bg-secondary px-1.5 text-[13px] leading-[18px]">
                {m.indexSelectedCount({ count: formatNumber(labels.length) })}
              </span>
            ) : (
              labels.map((label) => (
                <span
                  key={label}
                  className="truncate rounded-sm bg-secondary px-1.5 text-[13px] leading-[18px]"
                >
                  {label}
                </span>
              ))
            )}
          </>
        ) : null}
        <ChevronDown className="text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{facet.label}</DropdownMenuLabel>
          {facet.single ? (
            <DropdownMenuRadioGroup
              value={facet.selected[0] ?? ""}
              onValueChange={(next: string) => facet.onChange([next])}
            >
              {facet.options.map((option) => (
                <DropdownMenuRadioItem
                  key={option.value}
                  value={option.value}
                  className={phoneMenuItem}
                  closeOnClick
                >
                  {option.label}
                  <OptionMeta option={option} />
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          ) : (
            facet.options.map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                className={phoneMenuItem}
                checked={facet.selected.includes(option.value)}
                onCheckedChange={(checked) =>
                  facet.onChange(
                    checked
                      ? [...facet.selected, option.value]
                      : facet.selected.filter(
                          (value) => value !== option.value,
                        ),
                  )
                }
              >
                {option.label}
                <OptionMeta option={option} />
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuGroup>
        {active && !facet.single ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={phoneMenuItem}
              onClick={() => facet.onChange(facet.defaultSelected ?? [])}
            >
              {m.indexClearFilter()}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const choiceRow =
  "flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-accent";

function FilterSheet({
  facets,
  onReset,
}: {
  facets: Facet[];
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const active = facets.filter(facetActive).length;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:h-10 md:hidden"
          />
        }
      >
        <ListFilter aria-hidden />
        {m.indexFilters()}
        {active ? (
          <>
            <span
              aria-hidden
              className="rounded-sm bg-primary/10 px-1.5 text-[13px] leading-[18px] font-medium text-primary tabular-nums"
            >
              {formatNumber(active)}
            </span>
            <span className="sr-only">
              {m.indexFiltersApplied({ count: formatNumber(active) })}
            </span>
          </>
        ) : null}
      </SheetTrigger>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[85svh] gap-0 rounded-t-xl"
      >
        <SheetHeader className="flex-row items-center justify-between gap-2 border-b px-4 py-3">
          <SheetTitle className="text-base font-semibold">
            {m.indexFilters()}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {m.indexFiltersHint()}
          </SheetDescription>
          {onReset ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={onReset}
            >
              {m.indexReset()}
            </Button>
          ) : null}
        </SheetHeader>
        <div className="grid gap-6 overflow-y-auto px-2 py-4">
          {facets.map((facet) =>
            facet.single ? (
              <div key={facet.id} className="grid gap-1">
                <p
                  id={`${id}-${facet.id}`}
                  className="mb-1 px-2 text-sm font-medium"
                >
                  {facet.label}
                </p>
                <RadioGroup
                  aria-labelledby={`${id}-${facet.id}`}
                  value={facet.selected[0] ?? ""}
                  onValueChange={(next: string) => facet.onChange([next])}
                  className="grid gap-1"
                >
                  {facet.options.map((option) => (
                    <label key={option.value} className={choiceRow}>
                      <RadioGroupItem value={option.value} />
                      {option.label}
                      <OptionMeta option={option} />
                    </label>
                  ))}
                </RadioGroup>
              </div>
            ) : (
              <fieldset key={facet.id} className="grid gap-1">
                <legend className="mb-1 px-2 text-sm font-medium">
                  {facet.label}
                </legend>
                {facet.options.map((option) => (
                  <label key={option.value} className={choiceRow}>
                    <Checkbox
                      checked={facet.selected.includes(option.value)}
                      onCheckedChange={(checked) =>
                        facet.onChange(
                          checked
                            ? [...facet.selected, option.value]
                            : facet.selected.filter(
                                (value) => value !== option.value,
                              ),
                        )
                      }
                    />
                    {option.label}
                    <OptionMeta option={option} />
                  </label>
                ))}
              </fieldset>
            ),
          )}
        </div>
        <SheetFooter className="border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SheetClose render={<Button type="button" className="h-10" />}>
            {m.indexDone()}
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Empty className="gap-5 border bg-card px-6 py-16">
      <EmptyHeader className="gap-1">
        {Icon ? (
          <EmptyMedia
            variant="icon"
            className="mb-3 rounded-full text-muted-foreground"
          >
            <Icon className="size-5" aria-hidden />
          </EmptyMedia>
        ) : null}
        <EmptyTitle className="text-base leading-6 font-semibold tracking-normal">
          <h2>{title}</h2>
        </EmptyTitle>
        {description ? (
          <EmptyDescription className="text-sm leading-5">
            {description}
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export function FilteredEmptyState({ onClear }: { onClear?: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title={m.indexNoResultsTitle()}
      description={m.indexNoResultsBody()}
      action={
        onClear ? (
          <Button type="button" variant="outline" onClick={onClear}>
            {m.indexClearFilters()}
          </Button>
        ) : null
      }
    />
  );
}
