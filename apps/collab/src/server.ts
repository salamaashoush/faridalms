import type { Collab } from "@faridalms/database/context";
import type { DocumentTicket, Ticket } from "@faridalms/domain/collab";
import type { Binding, Provider } from "@lexical/yjs";
import type { ServerWebSocket } from "bun";
import type { LexicalEditor } from "lexical";

import {
  checkpoint,
  liveDocument,
  storeLiveDocument,
} from "@faridalms/database/stores/collab";
import {
  isPacing,
  PACING_SIGNAL,
  roomOf,
  verifySignal,
  verifyTicket,
} from "@faridalms/domain/collab";
import {
  contentDocumentSchema,
  contentPlainText,
} from "@faridalms/domain/content";
import { buildContentEditor } from "@faridalms/editor/headless";
import { Hocuspocus } from "@hocuspocus/server";
import {
  createBinding,
  syncLexicalUpdateToYjs,
  syncYjsChangesToLexical,
} from "@lexical/yjs";
import { $getRoot } from "lexical";
import * as v from "valibot";
import * as Y from "yjs";

/** A checkpoint at most this often while people keep editing, and when the last one leaves. */
const CHECKPOINT_MS = 10 * 60_000;

type Context = Ticket;

interface Live {
  editor: LexicalEditor;
  binding: Binding;
  stop: () => void;
  checkpointAt: number;
}

/** The server keeps no cursors or presence of its own, so its provider does nothing. */
const silent = {
  awareness: {
    getLocalState: () => null,
    getStates: () => new Map(),
    on: () => {},
    off: () => {},
    setLocalState: () => {},
    setLocalStateField: () => {},
  },
  connect: () => {},
  disconnect: () => {},
  on: () => {},
  off: () => {},
} as unknown as Provider;

/**
 * Binds a headless editor to the shared document, so the server always knows
 * the content the shared state amounts to. It follows the document and never
 * writes to it, except to fill an empty one from stored content.
 */
async function follow(
  doc: Y.Doc,
  stored: Record<string, unknown> | null,
): Promise<Live> {
  const editor = buildContentEditor({ empty: true });
  const binding = createBinding(
    editor,
    silent,
    "root",
    doc,
    new Map([["root", doc]]),
  );
  const root = binding.root.getSharedType();
  const onChange = (
    events: Y.YEvent<Y.XmlText>[],
    transaction: Y.Transaction,
  ) => {
    if (transaction.origin === binding) return;
    syncYjsChangesToLexical(binding, silent, events, false, () => {});
  };
  root.observeDeep(onChange as never);
  // The server never edits, so its own commits are only the bootstrap below;
  // updates it takes from Yjs carry the collaboration tag and are not echoed.
  const stopPush = editor.registerUpdateListener(
    ({
      prevEditorState,
      editorState,
      dirtyElements,
      dirtyLeaves,
      normalizedNodes,
      tags,
    }) =>
      syncLexicalUpdateToYjs(
        binding,
        silent,
        prevEditorState,
        editorState,
        dirtyElements,
        dirtyLeaves,
        normalizedNodes,
        tags,
      ),
  );
  if (root.length === 0 && stored) {
    const target = editor.parseEditorState(JSON.stringify(stored));
    const wanted = target.read(() => $getRoot().getTextContent());
    editor.setEditorState(target);
    // Lexical commits on its own schedule; clients must not sync an empty page.
    const filled = () => root.length > 0;
    for (let turn = 0; turn < 100; turn += 1) {
      const text = editor
        .getEditorState()
        .read(() => $getRoot().getTextContent());
      if (filled() && text === wanted) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  return {
    editor,
    binding,
    stop: () => {
      stopPush();
      root.unobserveDeep(onChange as never);
    },
    checkpointAt: Date.now(),
  };
}

const unit = (ticket: DocumentTicket) => ({
  tenantId: ticket.tenantId,
  requestId: crypto.randomUUID(),
  actor: { kind: "user" as const, userId: ticket.userId },
});

function derive(live: Live) {
  const result = v.safeParse(
    contentDocumentSchema,
    live.editor.getEditorState().toJSON(),
  );
  return result.success
    ? {
        content: result.output as unknown as Record<string, unknown>,
        plainText: contentPlainText(result.output),
      }
    : null;
}

/**
 * Live editing for collaborative documents. A connection is let in only
 * with a ticket the API signed for that very document; a reader's connection
 * is read-only. The shared state and the validated content derived from it
 * are stored together as the `collab` role, which can touch nothing else.
 *
 * A lesson's pacing room holds no document: its students and teacher only
 * listen, and hear a signal whenever the API says the teacher moved the
 * class. Nothing of it is loaded or stored, and what a listener says of
 * itself reaches no one.
 */
export function createCollab(input: {
  collab: Collab;
  cellSecret: Uint8Array<ArrayBuffer>;
  debounceMs?: number;
}) {
  const live = new Map<string, Live>();
  return new Hocuspocus<Context>({
    name: "farida-collab",
    quiet: true,
    debounce: input.debounceMs ?? 2000,
    maxDebounce: 10_000,
    async onAuthenticate({ token, documentName, connectionConfig }) {
      const ticket = await verifyTicket(token, input.cellSecret);
      if (!ticket || roomOf(ticket) !== documentName)
        throw new Error("collab.forbidden");
      if (isPacing(ticket) || ticket.access === "read")
        connectionConfig.readOnly = true;
      return ticket;
    },
    async beforeHandleAwareness({ context, states }) {
      if (context && isPacing(context)) states.clear();
    },
    async onLoadDocument({ document, documentName, context }) {
      if (isPacing(context)) return document;
      const row = await input.collab.withCollab(unit(context), "read", (tx) =>
        liveDocument(tx, context.tenantId, context.documentId),
      );
      if (!row) throw new Error("collab.not_found");
      // The editor is bound first so it reads the stored state as it arrives;
      // bound after, it would start empty and add a paragraph of its own.
      const state = await follow(document, row.ydoc ? null : row.content);
      if (row.ydoc) Y.applyUpdate(document, row.ydoc);
      live.set(documentName, state);
      return document;
    },
    async onStoreDocument({
      document,
      documentName,
      lastContext,
      clientsCount,
    }) {
      const context = lastContext;
      const state = live.get(documentName);
      if (!state || isPacing(context) || context.access !== "write") return;
      const derived = derive(state);
      if (!derived)
        console.warn(
          JSON.stringify({
            collab: "invalid_content",
            documentId: context.documentId,
          }),
        );
      const leaving = clientsCount === 0;
      const due = Date.now() - state.checkpointAt >= CHECKPOINT_MS;
      await input.collab.withCollab(unit(context), "write", async (tx) => {
        await storeLiveDocument(tx, {
          tenantId: context.tenantId,
          documentId: context.documentId,
          ydoc: Y.encodeStateAsUpdate(document),
          derived,
          userId: context.userId,
        });
        if (derived && (leaving || due))
          await checkpoint(tx, {
            tenantId: context.tenantId,
            documentId: context.documentId,
            userId: context.userId,
          });
      });
      if (derived && (leaving || due)) state.checkpointAt = Date.now();
    },
    async afterUnloadDocument({ documentName }) {
      live.get(documentName)?.stop();
      live.delete(documentName);
    },
  });
}

interface Peer {
  request: Request;
  connection?: ReturnType<Hocuspocus["handleConnection"]>;
}

/**
 * Passes a signal the API signed to everyone listening in its room. The edge
 * refuses this path from outside, and the signature refuses anyone else.
 */
async function relay(
  hocuspocus: Hocuspocus<Context>,
  request: Request,
  cellSecret: Uint8Array<ArrayBuffer>,
) {
  const signal = await verifySignal(await request.text(), cellSecret);
  if (!signal) return new Response(null, { status: 403 });
  hocuspocus.documents.get(signal.room)?.broadcastStateless(PACING_SIGNAL);
  return new Response(null, { status: 204 });
}

/** Serves the collaboration protocol over Bun's WebSockets, and the API's signals over HTTP. */
export function serve(
  hocuspocus: Hocuspocus<Context>,
  port: number,
  cellSecret: Uint8Array<ArrayBuffer>,
) {
  return Bun.serve<Peer>({
    port,
    fetch(request, server) {
      const { pathname } = new URL(request.url);
      if (pathname === "/health/live") return Response.json({ status: "ok" });
      if (pathname === "/signal")
        return request.method === "POST"
          ? relay(hocuspocus, request, cellSecret)
          : new Response(null, { status: 405 });
      if (server.upgrade(request, { data: { request } })) return undefined;
      return new Response("Upgrade required", { status: 426 });
    },
    websocket: {
      open(socket: ServerWebSocket<Peer>) {
        socket.data.connection = hocuspocus.handleConnection(
          socket,
          socket.data.request,
        );
      },
      message(socket: ServerWebSocket<Peer>, message) {
        socket.data.connection?.handleMessage(
          typeof message === "string"
            ? new TextEncoder().encode(message)
            : new Uint8Array(message),
        );
      },
      close(socket: ServerWebSocket<Peer>, code, reason) {
        socket.data.connection?.handleClose({ code, reason });
      },
    },
  });
}
