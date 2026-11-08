import { FileIcon, FileViewer } from "@faridalms/editor/files";
import { Button } from "@faridalms/ui/button";
import { RecordEmpty, RecordList } from "@faridalms/ui/system/record-page";
import { SheetPanel } from "@faridalms/ui/system/sheet-panel";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { fileStrings } from "~/components/content/strings";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

const TRASH_DAYS = 30;

/** A file a previous version was replaced in. */
export interface VersionedFile {
  id: string;
  name: string;
}

/** A previous version of a file, as the server lists it. */
export interface FileVersion {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  replacedAt: string;
}

export interface VersionsSheetProps {
  file: VersionedFile | null;
  /** The file's previous versions, newest first. */
  load: (id: string) => Promise<{ versions: FileVersion[] }>;
  /** Puts a previous version back under the file. */
  restore: (id: string, versionId: string) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
  onRestored: (id: string) => Promise<unknown>;
}

/**
 * A file's previous versions while the trash keeps them, each to open or
 * to put back, which keeps the one it replaces as a version in turn.
 */
export function VersionsSheet({
  file,
  load,
  restore,
  onOpenChange,
  onRestored,
}: VersionsSheetProps) {
  const listed = useQuery({
    queryKey: ["files", "versions", file?.id],
    queryFn: () => (file ? load(file.id) : Promise.resolve({ versions: [] })),
    enabled: file !== null,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const versions = listed.data?.versions ?? [];
  const shown = versions.find((row) => row.id === viewing);
  return (
    <SheetPanel
      open={file !== null}
      onOpenChange={onOpenChange}
      title={file ? `${m.filesVersions()}: ${file.name}` : m.filesVersions()}
      description={m.filesVersionsHint()}
    >
      {listed.isPending ? (
        <div aria-busy="true" className="min-h-24" />
      ) : versions.length === 0 ? (
        <RecordEmpty>{m.filesVersionsEmpty()}</RecordEmpty>
      ) : (
        <RecordList>
          {versions.map((version) => {
            const until = new Date(
              new Date(version.replacedAt).getTime() +
                TRASH_DAYS * 24 * 60 * 60 * 1000,
            ).toISOString();
            return (
              <li key={version.id} className="flex items-center gap-3 py-3">
                <FileIcon
                  file={{ name: version.name, mime: version.mediaType }}
                  className="size-5 shrink-0 text-muted-foreground"
                />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <button
                    type="button"
                    onClick={() => setViewing(version.id)}
                    className="truncate text-start text-sm leading-5 font-medium hover:text-primary hover:underline"
                  >
                    <bdi>{version.name}</bdi>
                  </button>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {m.filesVersionFact({
                      date: formatDate(version.replacedAt),
                      until: formatDate(until),
                    })}
                  </span>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="max-md:h-10"
                  disabled={busy !== null || !file}
                  aria-label={m.filesRestoreNamed({ name: version.name })}
                  onClick={async () => {
                    if (!file) return;
                    setBusy(version.id);
                    try {
                      await restore(file.id, version.id);
                      await Promise.all([
                        listed.refetch(),
                        onRestored(file.id),
                      ]);
                      toast.success(m.filesVersionRestored());
                    } catch (error) {
                      toast.error(getMessageFromError(error));
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  <RotateCcw aria-hidden />
                  {m.filesRestore()}
                </Button>
              </li>
            );
          })}
        </RecordList>
      )}
      {shown ? (
        <FileViewer
          file={{
            name: shown.name,
            mime: shown.mediaType,
            bytes: shown.sizeBytes,
          }}
          url={`/files/${shown.id}`}
          open
          onOpenChange={(open) => {
            if (!open) setViewing(null);
          }}
          strings={fileStrings()}
          locale={getLocale()}
        />
      ) : null}
    </SheetPanel>
  );
}
