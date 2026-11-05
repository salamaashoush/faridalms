import { openCell, openOwner } from "@faridalms/database/context";
import { localKek } from "@faridalms/database/crypto";
import {
  openDirectory,
  openDirectorySync,
} from "@faridalms/database/directory/client";
import { emailGateway } from "@faridalms/mail/gateway";
import { createProvider } from "@faridalms/mail/providers";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "./app";
import { startProgramReruns } from "./coding/rerun";
import { createJavaScriptRunner, createPythonRunner } from "./coding/run";
import { startAdmissionsClock } from "./core/admissions-clock";
import { createKeyRing } from "./core/keys";
import { createLoginIndex, startLoginIndex } from "./core/login-index";
import { startPartitionUpkeep } from "./core/partitions";
import { startPublicationClock } from "./core/publication";
import { turnstileFrom } from "./core/turnstile";
import { env } from "./env";
import { createFilesHost, linkKey } from "./files/links";
import { createMakeCode } from "./files/makecode";
import { createScanner } from "./files/scan";
import { fileKeys } from "./files/sealed";
import {
  bucketEndpoint,
  DiskFileStore,
  PUBLIC_KEY,
  S3FileStore,
} from "./files/store";
import { createStudio } from "./files/studio";
import { startFileUpkeep } from "./files/upkeep";
import { createHostChecks } from "./hosts/checks";
import { streamLinkKey } from "./media/streams";
import { resendInbox } from "./notifications/gateway";
import { startDelivery } from "./notifications/scheduler";
import { createProvisioner } from "./provisioning/host";
import { startQuizClock } from "./quizzes/clock";

const cell = openCell(
  {
    app: env.CELL_APP_URL,
    site: env.CELL_SITE_URL,
    worker: env.CELL_WORKER_URL,
    retention: env.CELL_RETENTION_URL,
  },
  env.CELL_POOL_SIZE,
);
const directory = openDirectory(env.DIRECTORY_URL);
const domains = { portal: env.PORTAL_DOMAIN, sites: env.SITES_DOMAIN };
const edgeAddress = env.EDGE_IPV4 ?? null;
const directorySync = env.DIRECTORY_SYNC_URL
  ? openDirectorySync(env.DIRECTORY_SYNC_URL, `cell:${env.CELL_ID}`)
  : null;
const hosts = directorySync
  ? {
      registry: directorySync.hosts,
      checks: createHostChecks({
        registry: directorySync.hosts,
        directory,
        domains,
        edgeAddress,
      }),
    }
  : null;
const logins = env.LOGIN_INDEX_KEY
  ? createLoginIndex({
      cell,
      directory,
      sync: directorySync,
      secret: new Uint8Array(Buffer.from(env.LOGIN_INDEX_KEY, "base64")),
    })
  : null;
const kek = localKek(
  new Uint8Array(Buffer.from(env.CELL_KEK, "base64")),
  `local:${env.CELL_ID}`,
);
function bucket(name: string | undefined) {
  return new Bun.S3Client({
    bucket: name,
    endpoint: bucketEndpoint(env.S3_ENDPOINT, name, env.S3_ADDRESSING_STYLE),
    virtualHostedStyle: env.S3_ADDRESSING_STYLE === "virtual",
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  });
}
const stores =
  env.FILE_STORAGE === "s3"
    ? {
        files: new S3FileStore(bucket(env.FILE_BUCKET)),
        publicMedia: new S3FileStore(
          bucket(env.PUBLIC_MEDIA_BUCKET),
          PUBLIC_KEY,
        ),
      }
    : {
        files: new DiskFileStore(env.FILE_STORAGE_DIR),
        publicMedia: new DiskFileStore(
          join(env.FILE_STORAGE_DIR, "public-media"),
          PUBLIC_KEY,
        ),
      };
const cellSecret = new Uint8Array(Buffer.from(env.CELL_SECRET, "base64"));
const keys = createKeyRing(kek, env.CELL_ID);
const filesPort = env.FILES_PORT ?? env.API_PORT + 2;
const filesOrigin = (
  env.FILES_ORIGIN ?? `http://127.0.0.1:${filesPort}`
).replace(/\/$/, "");
const filesServer = Bun.serve({
  port: filesPort,
  fetch: createFilesHost({
    files: stores.files,
    key: linkKey(cellSecret),
    keys: fileKeys({ cell, keys }),
    origin: filesOrigin,
    libraries: fileURLToPath(new URL("../vendor", import.meta.url)),
    studio: createStudio({
      dir:
        env.SCRATCH_DIR ??
        fileURLToPath(new URL("../vendor/scratch", import.meta.url)),
    }),
    makecode: createMakeCode({
      editor:
        env.MAKECODE_DIR ??
        fileURLToPath(new URL("../vendor/makecode/editor", import.meta.url)),
    }),
  }),
});
const gateways = {
  email: emailGateway(env),
  sms: createProvider(env.SMS_WEBHOOK_URL, env.NOTIFY_WEBHOOK_TOKEN),
  conversations: {
    replyDomain: env.INBOUND_EMAIL_DOMAIN ?? null,
    cellSecret,
    files: stores.files,
  },
};
const inbound =
  env.INBOUND_EMAIL_DOMAIN && env.RESEND_API_KEY && env.RESEND_WEBHOOK_SECRET
    ? {
        domain: env.INBOUND_EMAIL_DOMAIN,
        webhookSecret: env.RESEND_WEBHOOK_SECRET,
        inbox: resendInbox({
          RESEND_API_KEY: env.RESEND_API_KEY,
          RESEND_API_URL: env.RESEND_API_URL,
        }),
        senderDomain: env.EMAIL_FROM
          ? (/@([^>\s]+)>?\s*$/.exec(env.EMAIL_FROM)?.[1]?.toLowerCase() ??
            null)
          : null,
      }
    : null;
const runners = {
  python: createPythonRunner(
    env.PYTHON_DIR ?? join(process.cwd(), "vendor", "python"),
  ),
  javascript: createJavaScriptRunner(),
};

const server = Bun.serve({
  port: env.API_PORT,
  // Uploads stream through the raw file route; everything else stays small.
  maxRequestBodySize: env.MAX_UPLOAD_BYTES + 1024 * 1024,
  fetch: createApp({
    cell,
    directory,
    keys,
    cellId: env.CELL_ID,
    cellSecret,
    domains,
    edgeAddress,
    hosts,
    logins,
    trustedProxyHops: env.TRUSTED_PROXY_HOPS,
    ...stores,
    filesOrigin,
    linkKey: linkKey(cellSecret),
    mediaOrigin: env.MEDIA_ORIGIN?.replace(/\/$/, "") ?? null,
    mediaCaptions:
      env.MEDIA_ORIGIN !== undefined && env.MEDIA_CAPTIONS === "on",
    streamLinkKey: streamLinkKey(cellSecret),
    scanner: createScanner(env.CLAMD_ADDRESS),
    runners,
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
    channels: {
      email: gateways.email !== null,
      sms: Boolean(env.SMS_WEBHOOK_URL),
    },
    mail: gateways.email,
    productInbox: env.PRODUCT_INBOX ?? null,
    intake:
      env.INTAKE_URL && env.INTAKE_SECRET
        ? { url: env.INTAKE_URL, secret: env.INTAKE_SECRET }
        : null,
    turnstile: turnstileFrom(env),
    inbound,
  }),
});
console.info(
  `Farida LMS API listening on port ${server.port}, files on ${filesServer.port}`,
);

// Its own listener and its own login: nothing the public port serves can
// reach the owner role.
const owner = env.CELL_PROVISION_URL ? openOwner(env.CELL_PROVISION_URL) : null;
const provisionServer =
  owner && env.PROVISION_SECRET
    ? Bun.serve({
        hostname: env.PROVISION_HOST,
        port: env.PROVISION_PORT,
        fetch: createProvisioner({
          owner,
          directory,
          kek,
          cellId: env.CELL_ID,
          domains,
          mail: gateways.email,
          secret: new Uint8Array(Buffer.from(env.PROVISION_SECRET, "base64")),
        }),
      })
    : null;
if (provisionServer)
  console.info(
    `Provisioner listening on ${env.PROVISION_HOST}:${provisionServer.port}`,
  );

const stopDelivery =
  env.CELL_WORKER_URL && (gateways.email || gateways.sms)
    ? startDelivery({
        cell,
        directory,
        cellId: env.CELL_ID,
        gateways,
        intervalMs: 30_000,
      })
    : null;

// Sweeps and reports write as the worker, so they run only where it can log in.
const stopUpkeep = env.CELL_WORKER_URL
  ? startFileUpkeep({
      cell,
      directory,
      sync: directorySync,
      cellId: env.CELL_ID,
      store: stores.files,
      sweepMs: env.FILE_SWEEP_MS,
      reportMs: env.USAGE_REPORT_MS,
    })
  : null;

// A timed quiz left open when its time ran out is handed in by the worker.
const stopPartitions = env.CELL_WORKER_URL ? startPartitionUpkeep(cell) : null;

// Decisions are released on their intake's day and offers lapse after
// their last one, at each school's own midnight.
const stopAdmissionsClock = env.CELL_WORKER_URL
  ? startAdmissionsClock({
      cell,
      directory,
      cellId: env.CELL_ID,
      channels: {
        email: gateways.email !== null,
        sms: Boolean(env.SMS_WEBHOOK_URL),
      },
      intervalMs: 5 * 60_000,
    })
  : null;

// Whatever was set to go out later is told to its readers once it is out:
// announcements, news and work set to open later.
const stopPublicationClock = env.CELL_WORKER_URL
  ? startPublicationClock({
      cell,
      directory,
      cellId: env.CELL_ID,
      channels: {
        email: gateways.email !== null,
        sms: Boolean(env.SMS_WEBHOOK_URL),
      },
      intervalMs: 60_000,
    })
  : null;

const stopQuizClock = env.CELL_WORKER_URL
  ? startQuizClock({
      cell,
      directory,
      cellId: env.CELL_ID,
      intervalMs: 30_000,
    })
  : null;

// Code answers to mark again run here, where the code runners are.
const stopProgramReruns = env.CELL_WORKER_URL
  ? startProgramReruns({
      cell,
      directory,
      cellId: env.CELL_ID,
      runners,
      intervalMs: 30_000,
    })
  : null;

// Schools' own hosts are checked when due: on request, then hourly. Every
// replica may run the pass; a host is claimed by one before it is checked.
const stopHostChecks = hosts?.checks.start(30_000) ?? null;

// Each cell keeps its own tenants' sign-in names in the directory's index.
const stopLoginIndex =
  logins && directorySync
    ? startLoginIndex({
        index: logins,
        directory,
        cellId: env.CELL_ID,
        intervalMs: 15 * 60_000,
      })
    : null;

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await server.stop();
  await filesServer.stop();
  await provisionServer?.stop();
  await stopDelivery?.();
  await stopUpkeep?.();
  await stopQuizClock?.();
  await stopPublicationClock?.();
  await stopAdmissionsClock?.();
  await stopPartitions?.();
  await stopProgramReruns?.();
  await stopHostChecks?.();
  await stopLoginIndex?.();
  await directorySync?.close();
  await cell.close();
  await owner?.close();
  await directory.close();
  process.exit(0);
}
process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
