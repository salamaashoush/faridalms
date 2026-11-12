import type { AssistantHost } from "@faridalms/domain/assistant";
import type { ReactNode } from "react";

import { createContext, useContext, useMemo } from "react";

/** The lesson or brief a document belongs to, which the language model's help works on. */
const DocumentHostContext = createContext<{
  type: AssistantHost;
  id: string | null;
} | null>(null);

export interface DocumentHostProviderProps {
  type: AssistantHost;
  /** None while the lesson or brief is not yet saved. */
  id: string | null;
  children: ReactNode;
}

export function DocumentHostProvider({
  type,
  id,
  children,
}: DocumentHostProviderProps) {
  const value = useMemo(() => ({ type, id }), [type, id]);
  return (
    <DocumentHostContext.Provider value={value}>
      {children}
    </DocumentHostContext.Provider>
  );
}

/** The lesson or brief the document shown here belongs to, if any. */
export function useDocumentHost() {
  return useContext(DocumentHostContext);
}
