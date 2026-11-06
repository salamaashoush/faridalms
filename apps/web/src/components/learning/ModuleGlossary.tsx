import { glossaryOf, termKey } from "@faridalms/domain/glossary";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@faridalms/ui/sheet";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookA, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";

import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { moduleGlossaryQuery } from "~/queries/learning";
import { formatNumber } from "~/utils/datetime";

import { ReadAloud } from "./ReadAloud";

const fileUrl = (fileId: string) => `/files/${fileId}`;

export interface ModuleGlossaryProps {
  moduleId: string;
  studentId?: string;
}

/**
 * A module's glossary: every word its lessons define, once each, in the
 * reader's alphabetical order, with the lesson that defines it, so a
 * student revises a unit's words in one place. Nothing shows while the
 * lessons define none.
 */
export function ModuleGlossary({
  moduleId,
  studentId = "",
}: ModuleGlossaryProps) {
  const found = useQuery(moduleGlossaryQuery(moduleId, studentId));
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const words = useDeferredValue(termKey(search));
  const entries = useMemo(
    () => glossaryOf(found.data ?? [], getLocale()),
    [found.data],
  );
  const shown = words
    ? entries.filter(
        (entry) =>
          termKey(entry.words).includes(words) ||
          (entry.gloss ? termKey(entry.gloss).includes(words) : false),
      )
    : entries;
  if (entries.length === 0) return null;
  const end = getTextDirection(getLocale()) === "rtl" ? "left" : "right";
  return (
    <RecordSection title={m.lrnGlossary()} description={m.lrnGlossaryHint()}>
      <Button
        type="button"
        variant="outline"
        className="w-fit max-md:h-10"
        onClick={() => setOpen(true)}
      >
        <BookA aria-hidden />
        {m.lrnGlossaryOpen({
          count: entries.length,
          value: formatNumber(entries.length),
        })}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={end}
          className="flex w-full flex-col gap-0 p-0 sm:max-w-lg"
        >
          <SheetHeader className="gap-1 border-b px-5 py-4">
            <SheetTitle>{m.lrnGlossary()}</SheetTitle>
            <SheetDescription>{m.lrnGlossaryHint()}</SheetDescription>
          </SheetHeader>
          <div className="border-b px-5 py-3">
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                dir="auto"
                value={search}
                aria-label={m.lrnGlossarySearch()}
                placeholder={m.lrnGlossarySearch()}
                onChange={(event) => setSearch(event.target.value)}
                className="ps-8 max-md:h-10"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            {shown.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                {m.lrnGlossaryNone()}
              </p>
            ) : (
              <dl className="divide-y">
                {shown.map((entry) => (
                  <div
                    key={termKey(entry.words)}
                    dir="auto"
                    className="grid gap-1 py-3"
                  >
                    <dt className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-sm leading-5 font-semibold">
                        <bdi>{entry.words}</bdi>
                        {entry.gloss ? (
                          <span className="ms-2 font-normal text-muted-foreground">
                            <bdi>{entry.gloss}</bdi>
                          </span>
                        ) : null}
                      </span>
                      <ReadAloud
                        text={entry.words}
                        className="size-8 [&_svg]:size-4"
                      />
                    </dt>
                    <dd className="text-sm leading-6">{entry.definition}</dd>
                    {entry.fileId ? (
                      <dd>
                        <img
                          src={fileUrl(entry.fileId)}
                          alt={entry.alt ?? ""}
                          loading="lazy"
                          className="max-h-32 rounded-md object-contain"
                        />
                      </dd>
                    ) : null}
                    <dd className="text-[13px] leading-[18px] text-muted-foreground">
                      <Link
                        to="/lessons/$lessonId"
                        params={{ lessonId: entry.lessonId }}
                        search={{}}
                        className="hover:text-primary hover:underline"
                      >
                        {m.lrnGlossaryFrom({ lesson: entry.lessonTitle })}
                      </Link>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </RecordSection>
  );
}
