import type { SearchHit } from "@faridalms/domain/search";

import { Button } from "@faridalms/ui/button";
import { DialogContent } from "@faridalms/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { Link, useHydrated, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Dialog, DialogTitle, DialogTrigger } from "~/components/app/dialog";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { searchQuery } from "~/queries/search";
import { pageOn } from "~/utils/modules";

import { NAVIGATION } from "./navigation";
import { HIT_ROW, HitLink, SearchResults } from "./SearchResults";

const RECENT_LIMIT = 6;

// Session storage, not local: school computers are shared, and the names a
// teacher opened should leave with the tab rather than wait for the next user.
const recentKey = (userId: string) => `farida.search.recent.${userId}`;

const isHit = (value: unknown): value is SearchHit =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as SearchHit).id === "string" &&
  typeof (value as SearchHit).target === "string" &&
  typeof (value as SearchHit).title === "string" &&
  Array.isArray((value as SearchHit).roles);

function readRecent(userId: string): SearchHit[] {
  try {
    const stored: unknown = JSON.parse(
      sessionStorage.getItem(recentKey(userId)) ?? "[]",
    );
    return Array.isArray(stored) ? stored.filter(isHit) : [];
  } catch {
    return [];
  }
}

function SectionTitle({ id, children }: { id: string; children: string }) {
  return (
    <h3
      id={id}
      className="px-3 pb-1 text-xs leading-5 font-medium text-muted-foreground"
    >
      {children}
    </h3>
  );
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded border bg-muted px-1 font-sans text-[11px] leading-4 text-foreground">
      {children}
    </kbd>
  );
}

/**
 * Search across what the viewer may open, from anywhere (Ctrl/Cmd+K). Before
 * anything is typed it offers what they opened lately and the pages of their
 * workspace; Enter opens every result on the search page.
 */
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
  const [recent, setRecent] = useState<SearchHit[]>([]);
  const list = useRef<HTMLDivElement>(null);
  const results = useQuery({
    ...searchQuery(debounced),
    enabled: open && debounced.length > 0,
  });
  const groups = results.data?.groups ?? [];
  const typed = query.trim();
  const show = (value: boolean) => {
    if (value) setRecent(readRecent(user.id));
    else {
      setQuery("");
      setDebounced("");
    }
    setOpen(value);
  };
  const remember = (hit: SearchHit) => {
    const next = [
      hit,
      ...readRecent(user.id).filter(
        (item) => !(item.id === hit.id && item.target === hit.target),
      ),
    ].slice(0, RECENT_LIMIT);
    sessionStorage.setItem(recentKey(user.id), JSON.stringify(next));
    show(false);
  };
  const openAll = () => {
    if (!typed) return;
    show(false);
    void navigate({ to: "/search", search: { q: typed, kind: "all" } });
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
        pageOn(user.modules, item.to) &&
        (typed === "" ||
          item.label().toLocaleLowerCase().includes(typed.toLocaleLowerCase())),
    )
    .slice(0, typed ? 4 : 6);
  const searching = debounced !== "" && results.isPending;
  const nothing =
    typed !== "" &&
    debounced === typed &&
    !searching &&
    !results.isError &&
    groups.length === 0 &&
    pages.length === 0;

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
    const handle = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    // The sidebar's launcher answers the shortcut on wide screens and the top
    // bar's on phones, so one press never opens two palettes.
    const wide = window.matchMedia("(min-width: 48rem)");
    const onKeyDown = (event: KeyboardEvent) => {
      if (wide.matches !== (variant === "sidebar")) return;
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setOpen((value) => {
          if (!value) setRecent(readRecent(user.id));
          return !value;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [user.id, variant]);

  return (
    <Dialog open={open} onOpenChange={show}>
      <DialogTrigger
        render={
          variant === "sidebar" ? (
            <Button
              disabled={!hydrated}
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 bg-background font-normal text-muted-foreground shadow-none"
              aria-label={m.searchLauncher()}
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
              className="max-md:size-10"
              aria-label={m.searchLauncher()}
            >
              <Search className="size-4" aria-hidden />
            </Button>
          )
        }
      />
      <DialogContent
        showCloseButton={false}
        className="top-[10vh] max-h-[80vh] translate-y-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 max-sm:top-2 max-sm:max-h-[calc(100dvh-1rem)] sm:max-w-[640px]"
      >
        <DialogTitle className="sr-only">{m.searchOpen()}</DialogTitle>
        <div className="flex items-center gap-2 border-b px-4">
          <Search
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            aria-label={m.searchOpen()}
            placeholder={m.searchPlaceholder()}
            value={query}
            maxLength={100}
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
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
          <Button
            variant="ghost"
            size="sm"
            className="sm:hidden"
            onClick={() => show(false)}
          >
            {m.commonCancel()}
          </Button>
          <span className="max-sm:hidden" aria-hidden>
            <Key>Esc</Key>
          </span>
        </div>
        <div
          ref={list}
          className="grid content-start gap-4 overflow-y-auto overscroll-contain p-2"
        >
          {typed ? (
            <Link
              to="/search"
              search={{ q: typed, kind: "all" }}
              onClick={() => show(false)}
              data-search-hit
              className={HIT_ROW}
            >
              <Search
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span dir="auto" className="min-w-0 flex-1 truncate">
                {m.searchEverything({ q: typed })}
              </span>
              <ArrowRight
                className="mt-0.5 size-4 shrink-0 text-muted-foreground rtl:-scale-x-100"
                aria-hidden
              />
            </Link>
          ) : recent.length > 0 ? (
            <section aria-labelledby="search-recent">
              <SectionTitle id="search-recent">{m.searchRecent()}</SectionTitle>
              <ul className="grid">
                {recent.map((hit) => (
                  <li key={`${hit.target}-${hit.id}`}>
                    <HitLink
                      hit={{ ...hit, snippet: null, when: null }}
                      q=""
                      workspace={user.workspace}
                      onNavigate={remember}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {pages.length > 0 ? (
            <section aria-labelledby="search-pages">
              <SectionTitle id="search-pages">
                {typed ? m.searchKindPages() : m.searchGoTo()}
              </SectionTitle>
              <ul className="grid">
                {pages.map(({ to, label, icon: Icon }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      onClick={() => show(false)}
                      data-search-hit
                      className={HIT_ROW}
                    >
                      <Icon
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      {label()}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {groups.length > 0 ? (
            <SearchResults
              groups={groups}
              q={debounced}
              onNavigate={remember}
              onMore={() => show(false)}
            />
          ) : null}
          <p aria-live="polite" className="sr-only">
            {searching ? m.searchLoading() : ""}
          </p>
          {results.isError ? (
            <p role="alert" className="px-3 py-2 text-sm text-destructive">
              {m.searchFailed()}
            </p>
          ) : null}
          {nothing ? (
            <div className="grid gap-1 px-3 py-8 text-center">
              <p dir="auto" className="text-sm font-medium">
                {m.searchNothing({ q: typed })}
              </p>
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                {m.searchNothingTips()}
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground max-sm:hidden">
          <span className="inline-flex items-center gap-1.5">
            <Key>↑</Key>
            <Key>↓</Key>
            {m.searchKeyMove()}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Key>Enter</Key>
            {m.searchKeyOpen()}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
