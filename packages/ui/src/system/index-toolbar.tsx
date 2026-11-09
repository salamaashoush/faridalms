import type { ReactNode } from "react";

import { Button } from "../button";
import { Checkbox } from "../checkbox";
import { cn } from "../cn";
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
} from "../dropdown-menu";
import { Input } from "../input";
import { RadioGroup, RadioGroupItem } from "../radio-group";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../sheet";
import { useRouterState } from "@tanstack/react-router";
import { ChevronDown, ListFilter, Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { phoneMenuItem } from "./action-menu";
import { optionGroups } from "./form-field";
import { ToolbarRow } from "./panel";
import { useDesignSystem } from "./provider";

const NO_FACETS: Facet[] = [];

export interface FacetOption {
  value: string;
  label: string;
  count?: number;
  /** Shown where a count would be when there is no count to give. */
  hint?: string;
  /** The heading the option is listed under, as in `SelectField`. */
  group?: string;
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

/** The toolbar's search, whose query the page keeps in its URL. */
export interface IndexSearch {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
}

export interface IndexToolbarProps {
  search?: IndexSearch;
  facets?: Facet[];
  onReset?: () => void;
  /**
   * The dates the list covers, such as a day stepper or a week's date,
   * after the filters. It is part of the page's address like a facet, but
   * not a filter Reset clears.
   */
  period?: ReactNode;
}

export interface IndexToolbarViewProps extends IndexToolbarProps {
  /** The view or sort menu, kept at the end. */
  view?: ReactNode;
  /** The list's own actions, after the view menu. */
  actions?: ReactNode;
}

function sameSelection(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value) => b.includes(value));
}

function facetActive(facet: Facet) {
  return !sameSelection(facet.selected, facet.defaultSelected ?? []);
}

/** A choice that always holds a value, such as the school year. */
function isScope(facet: Facet) {
  return Boolean(facet.defaultSelected?.length);
}

/**
 * A filter that narrows nothing and has no value to show: an offer to add
 * one. A scope never is.
 */
function facetUnset(facet: Facet) {
  return !isScope(facet) && facet.selected.length === 0;
}

export function isFiltered({ search, facets = [] }: IndexToolbarProps) {
  return Boolean(search?.value) || facets.some(facetActive);
}

export function IndexToolbar({
  search,
  facets = NO_FACETS,
  onReset,
  period,
  view,
  actions,
}: IndexToolbarViewProps) {
  const { strings } = useDesignSystem();
  const filtered = isFiltered({ search, facets });
  const shown = facets.slice(0, 3);
  // A choice that always holds a value says what the page is showing, so it
  // stays in the row on a phone; filters fold into the sheet.
  const scopes = shown.filter(isScope);
  const filters = shown.filter((facet) => !isScope(facet));
  return (
    <ToolbarRow.Provider value>
      <search
        aria-label={strings.searchAndFilter}
        className="flex min-h-8 flex-wrap items-center gap-2"
      >
        {search ? <SearchInput {...search} /> : null}
        {scopes.length ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {scopes.map((facet) => (
              <FacetFilter key={facet.id} facet={facet} />
            ))}
          </div>
        ) : null}
        {filters.length ? (
          <div className="hidden min-w-0 items-center gap-2 md:flex">
            {filters.map((facet) => (
              <FacetFilter key={facet.id} facet={facet} />
            ))}
          </div>
        ) : null}
        {filters.length ? (
          <FilterSheet
            facets={filters}
            onReset={filtered ? onReset : undefined}
          />
        ) : null}
        {period ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {period}
          </div>
        ) : null}
        {filtered && onReset ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={strings.reset}
            className="text-muted-foreground max-md:size-10"
            onClick={onReset}
          >
            <span className="hidden md:inline">{strings.reset}</span>
            <X aria-hidden />
          </Button>
        ) : null}
        {view || actions ? (
          <div className="ms-auto flex items-center gap-2">
            {view}
            {actions}
          </div>
        ) : null}
      </search>
    </ToolbarRow.Provider>
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
}: IndexSearch) {
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
  // The list stays on screen while a row's page loads. A search sent then
  // would replace that navigation and bring the person back to the list.
  const leaving = useRouterState({
    select: (state) =>
      state.location.pathname !== state.resolvedLocation?.pathname,
  });
  useEffect(() => {
    const timer =
      draft === sent || leaving
        ? undefined
        : setTimeout(() => {
            setSent(draft);
            onChangeRef.current(draft);
          }, 250);
    return () => clearTimeout(timer);
  }, [draft, sent, leaving]);
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

interface OptionMetaProps {
  option: FacetOption;
}

function OptionMeta({ option }: OptionMetaProps) {
  const { formatNumber } = useDesignSystem();
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

interface FacetFilterProps {
  facet: Facet;
}

function FacetFilter({ facet }: FacetFilterProps) {
  const { strings, formatNumber } = useDesignSystem();
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
            data-unset={facetUnset(facet) || undefined}
            className={cn(
              "max-w-72 min-w-0 font-normal max-md:h-10",
              // The dashed edge offers a filter not yet applied. It turns
              // solid while pointed at, focused or open, so the focus ring
              // never circles a dashed line.
              "data-unset:border-dashed data-unset:hover:border-solid data-unset:focus-visible:border-solid data-unset:aria-expanded:border-solid",
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
                {strings.selectedCount(formatNumber(labels.length))}
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
        {optionGroups(facet.options).map(({ group, options }) => (
          <FacetOptions
            key={group ?? ""}
            facet={facet}
            label={group ?? facet.label}
            options={options}
          />
        ))}
        {active && !isScope(facet) ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={phoneMenuItem}
              onClick={() => facet.onChange([])}
            >
              {strings.clearFilter}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface FacetOptionsProps {
  facet: Facet;
  label: string;
  options: FacetOption[];
}

/** One heading's options; a single-choice facet keeps one choice across them. */
function FacetOptions({ facet, label, options }: FacetOptionsProps) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {facet.single ? (
        <DropdownMenuRadioGroup
          value={facet.selected[0] ?? ""}
          onValueChange={(next: string) => facet.onChange([next])}
        >
          {options.map((option) => (
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
        options.map((option) => (
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
  );
}

const choiceRow =
  "flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-accent";

interface FilterSheetProps {
  facets: Facet[];
  onReset?: () => void;
}

function FilterSheet({ facets, onReset }: FilterSheetProps) {
  const { strings, formatNumber } = useDesignSystem();
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
        {strings.filters}
        {active ? (
          <>
            <span
              aria-hidden
              className="rounded-sm bg-primary/10 px-1.5 text-[13px] leading-[18px] font-medium text-primary tabular-nums"
            >
              {formatNumber(active)}
            </span>
            <span className="sr-only">
              {strings.filtersApplied(formatNumber(active))}
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
            {strings.filters}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {strings.filtersHint}
          </SheetDescription>
          {onReset ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={onReset}
            >
              {strings.reset}
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
            {strings.done}
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

