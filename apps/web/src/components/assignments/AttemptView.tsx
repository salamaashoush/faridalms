import type { FileSummary } from "@faridalms/database/repositories/files";
import type { ContentDocument } from "@faridalms/domain/content";

import { ContentView } from "~/components/content/ContentView";
import * as m from "~/i18n/messages";

import { FileList } from "./FileList";

export function AttemptView({
  content,
  plainText,
  files,
}: {
  content: ContentDocument | null;
  plainText: string | null;
  files: FileSummary[];
}) {
  return (
    <div className="space-y-4">
      {content ? (
        <ContentView document={content} />
      ) : plainText ? (
        <p className="text-sm leading-7 whitespace-pre-wrap">{plainText}</p>
      ) : (
        <p className="text-sm text-muted-foreground">{m.attemptNoText()}</p>
      )}
      {files.length ? (
        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {m.attemptFiles()}
          </h4>
          <FileList files={files} />
        </div>
      ) : null}
    </div>
  );
}
