import { useQuery } from "@tanstack/react-query";
import { Link, useHydrated, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "~/components/app/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { searchQuery } from "~/queries/search";

import { NAVIGATION } from "./navigation";
import { SearchResults } from "./SearchResults";

export function WorkspaceSearch({
  variant = "bar",
}: {
  variant?: "bar" | "sidebar";
}) {
  const hydrated = useHydrated();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const results = useQuery({
    ...searchQuery({ q: debounced, kind: "all", page: 1 }),
    enabled: open && debounced.length > 0,
  });
  const groups = results.data?.groups ?? [];
  const close = () => {
    setOpen(false);
    setQuery("");
    setDebounced("");
  };
  const openAll = () => {
    const q = query.trim();
    if (!q) return;
    close();
    void navigate({ to: "/search", search: { q, kind: "all", page: 1 } });
  };
  const moveFocus = (step: 1 | -1) => {
    const hits = [
      ...(list.current?.querySelectorAll<HTMLElement>("[data-search-hit]") ??
        []),
    ];
    if (hits.length === 0) return;
    const index = hits.indexOf(document.activeElement as HTMLElement);
    const next =
      index === -1 ? (step === 1 ? 0 : hits.length - 1) : index + step;
    hits[(next + hits.length) % hits.length]?.focus();
  };
  const pages = NAVIGATION[user.workspace]
    .flatMap((section) => section.items)
    .filter(
      (item) =>
        (!item.capability || user.capabilities.includes(item.capability)) &&
        (!item.feature || user.features[item.feature]) &&
        item.label().toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    );

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      if (!active.hasAttribute("data-search-hit")) return;
      event.preventDefault();
      moveFocus(event.key === "ArrowDown" ? 1 : -1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value) setOpen(true);
        else close();
      }}
    >
      <DialogTrigger
        render={
          variant === "sidebar" ? (
            <Button
              disabled={!hydrated}
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 bg-background font-normal text-muted-foreground shadow-none"
              aria-label={m.workspaceSearch()}
            >
              <Search className="size-4" aria-hidden />
              <span className="flex-1 truncate text-start">
                {m.shellSearch()}
              </span>
              <kbd
                className="rounded border bg-muted px-1 font-sans text-[10px] leading-4"
                aria-hidden
              >
                Ctrl K
              </kbd>
            </Button>
          ) : (
            <Button
              disabled={!hydrated}
              variant="ghost"
              size="icon-sm"
              aria-label={m.workspaceSearch()}
            >
              <Search className="size-4" aria-hidden />
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogTitle>{m.workspaceSearch()}</DialogTitle>
        <DialogDescription>{m.workspaceSearchHint()}</DialogDescription>
        <Input
          aria-label={m.workspaceSearch()}
          value={query}
          maxLength={100}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              openAll();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              moveFocus(1);
            }
          }}
        />
        <div
          ref={list}
          className="flex max-h-80 flex-col gap-3 overflow-y-auto"
        >
          {pages.length > 0 ? (
            <section aria-labelledby="search-pages">
              <h3
                id="search-pages"
                className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {m.searchKindPages()}
              </h3>
              {pages.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={close}
                  data-search-hit
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Icon className="size-4 text-primary" aria-hidden />
                  {label()}
                </Link>
              ))}
            </section>
          ) : null}
          {debounced && results.isPending ? (
            <p
              className="px-3 text-sm text-muted-foreground"
              aria-live="polite"
            >
              {m.searchLoading()}
            </p>
          ) : null}
          {results.isError ? (
            <p role="alert" className="px-3 text-sm text-destructive">
              {m.searchFailed()}
            </p>
          ) : null}
          {groups.length > 0 ? (
            <SearchResults
              groups={groups}
              q={debounced}
              compact
              onNavigate={close}
            />
          ) : null}
          {pages.length === 0 &&
          groups.length === 0 &&
          !(debounced && results.isPending) ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {m.workspaceNoResults()}
            </p>
          ) : null}
        </div>
        {debounced ? (
          <p className="text-xs text-muted-foreground">{m.searchEnterHint()}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
