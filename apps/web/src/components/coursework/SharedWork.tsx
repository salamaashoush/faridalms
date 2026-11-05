import { Button } from "@faridalms/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@faridalms/ui/sheet";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ContentView } from "~/components/content/ContentView";
import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { sharedWorkQuery } from "~/queries/coursework";
import { getSharedPiece } from "~/server/coursework";
import { formatInstant } from "~/utils/datetime";

import { CommentedWork, CommentList } from "./WorkComments";

const fileUrl = (fileId: string) => `/files/${fileId}`;

function Piece({
  attemptId,
  title,
  onClose,
}: {
  attemptId: string;
  title: string;
  onClose: () => void;
}) {
  const piece = useQuery({
    queryKey: ["coursework", "shared-piece", attemptId],
    queryFn: () => getSharedPiece({ data: { attemptId } }),
  });
  const [active, setActive] = useState<string | null>(null);
  const [reveal, setReveal] = useState(0);
  const [passages, setPassages] = useState<Record<string, string>>({});
  const end = getTextDirection(getLocale()) === "rtl" ? "left" : "right";
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={end}
        className="gap-0 p-0 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[640px] data-[side=right]:sm:max-w-[640px]"
      >
        <SheetHeader className="border-b px-5 py-3.5 pe-14">
          <SheetTitle className="text-base leading-6 font-semibold">
            <bdi>{title}</bdi>
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {piece.data?.content ? (
            piece.data.comments.length ? (
              <div className="grid gap-5">
                <CommentedWork
                  document={piece.data.content}
                  comments={piece.data.comments}
                  active={active}
                  reveal={reveal}
                  onPassages={setPassages}
                  onOpen={setActive}
                />
                <section
                  aria-labelledby={`shared-comments-${attemptId}`}
                  className="grid gap-3"
                >
                  <h3
                    id={`shared-comments-${attemptId}`}
                    className="text-sm leading-5 font-semibold"
                  >
                    {m.courseworkSharedComments()}
                  </h3>
                  <CommentList
                    comments={piece.data.comments}
                    passages={passages}
                    active={active}
                    onShow={(id) => {
                      setActive(id);
                      setReveal((count) => count + 1);
                    }}
                  />
                </section>
              </div>
            ) : (
              <ContentView document={piece.data.content} fileUrl={fileUrl} />
            )
          ) : (
            <div aria-busy="true" className="min-h-24" />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Work a child's teachers chose to share with the family, to read in full. */
export function SharedWork({ studentId }: { studentId: string }) {
  const shared = useInfiniteQuery(sharedWorkQuery(studentId));
  const pieces = shared.data?.pages.flatMap((page) => page.rows) ?? [];
  const [open, setOpen] = useState<{ attemptId: string; title: string }>();
  return (
    <RecordSection title={m.courseworkSharedTitle()}>
      {pieces.length === 0 ? (
        <RecordEmpty>{m.courseworkSharedNone()}</RecordEmpty>
      ) : (
        <RecordList>
          {pieces.map((piece) => (
            <li
              key={piece.attemptId}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3"
            >
              <div className="grid min-w-0 gap-0.5">
                <bdi className="text-sm leading-5 font-medium">
                  {piece.title}
                </bdi>
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {[piece.classCode, formatInstant(piece.sharedAt)].join(" · ")}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                className="max-md:h-10"
                onClick={() =>
                  setOpen({ attemptId: piece.attemptId, title: piece.title })
                }
              >
                {m.courseworkSharedRead()}
              </Button>
            </li>
          ))}
        </RecordList>
      )}
      {shared.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start max-md:h-10"
          disabled={shared.isFetchingNextPage}
          onClick={() => void shared.fetchNextPage()}
        >
          {m.courseworkSharedMore()}
        </Button>
      ) : null}
      {open ? (
        <Piece
          attemptId={open.attemptId}
          title={open.title}
          onClose={() => setOpen(undefined)}
        />
      ) : null}
    </RecordSection>
  );
}
