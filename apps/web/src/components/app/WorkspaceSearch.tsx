import { Link, useHydrated } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

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

import { NAVIGATION } from "./navigation";

export function WorkspaceSearch() {
  const hydrated = useHydrated();
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pages = NAVIGATION[user.role]
    .flatMap((section) => section.items)
    .filter(
      (item) =>
        (!item.permission || user.permissions.includes(item.permission)) &&
        item.label().toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    );

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
        setOpen(value);
        if (!value) setQuery("");
      }}
    >
      <DialogTrigger
        render={
          <Button
            disabled={!hydrated}
            variant="ghost"
            className="gap-2 text-muted-foreground"
            aria-label={m.workspaceSearch()}
          >
            <Search className="size-4" aria-hidden />
            <span className="hidden sm:inline">{m.workspaceSearch()}</span>
            <kbd
              className="ms-8 hidden rounded border px-1.5 py-0.5 text-[10px] lg:inline"
              aria-hidden
            >
              Ctrl K
            </kbd>
          </Button>
        }
      />
      <DialogContent>
        <DialogTitle>{m.workspaceSearch()}</DialogTitle>
        <DialogDescription>{m.workspaceSearchHint()}</DialogDescription>
        <Input
          aria-label={m.workspaceSearch()}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {pages.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Icon className="size-4 text-primary" aria-hidden />
              {label()}
            </Link>
          ))}
          {pages.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {m.workspaceNoResults()}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
