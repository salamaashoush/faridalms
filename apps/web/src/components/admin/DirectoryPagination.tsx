import { Button } from "@faridalms/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@faridalms/ui/pagination";
import { ChevronLeft, ChevronRight } from "lucide-react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

export function DirectoryPagination({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <Pagination
      className="justify-between gap-3"
      aria-label={m.paginationLabel()}
    >
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {m.paginationStatus({
          page: formatNumber(page),
          pages: formatNumber(pages),
          total: formatNumber(total),
          count: total,
        })}
      </p>
      <PaginationContent>
        <PaginationItem>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label={m.paginationPrevious()}
          >
            <ChevronLeft className="rtl:rotate-180" aria-hidden />
          </Button>
        </PaginationItem>
        <PaginationItem>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
            aria-label={m.paginationNext()}
          >
            <ChevronRight className="rtl:rotate-180" aria-hidden />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
