# Self-hosting Farida LMS

The whole platform on one server: Postgres, the API, the web, live editing,
the media service, the edge (Caddy, with HTTPS) and a nightly backup, all
from the images CI publishes. This is the second way to run Farida; the
first is [faridalms.com](https://faridalms.com), where it is run for you.

What is here:

- `compose.yaml`: the stack. With `.env`, the only file the server needs.
- `env.example`: every setting, with how to generate each secret.
- `Caddyfile`, `backup.sh`: built into the `edge` and `backup` images, so the
  routing and the backup move with the image tag.
- `restore.md`: restoring the databases and the files.
- `compose.local.yaml`, `smoke.sh`: the same stack on a workstation, checked
  end to end.

## What you need

- **A server** with Docker Engine and the Compose plugin, 4 CPUs and 8 GB of
  memory (see "Resources"; a school of a few hundred people fits in less),
  and 4 GB of swap. Arm64 and amd64 images are published. Open TCP 80 and
  443 and UDP 443 to everyone, and SSH to yourself.
- **Two domains**, each a registrable domain of its own: one for the portals
  where people sign in (`example.com` here) and one for the schools' public
  websites, where students' code also runs (`example.net`). Never put the
  second under the first: students' code must not share the portal's site.
- **Email**: a [Resend](https://resend.com) account with a verified sender
  domain, or an HTTPS endpoint of your own that sends what it is given.
  Every invitation and password reset goes by email.
- **Replies by email** (optional): a subdomain such as `reply.example.com`
  for families' answers to the school's messages. Add it to Resend for
  receiving and publish the MX record Resend shows, add a webhook for
  `email.received` to `https://api.example.com/callbacks/resend`, and set
  `INBOUND_EMAIL_DOMAIN` and `RESEND_WEBHOOK_SECRET` in `.env`. Without it,
  answers reach the school's own address. The steps and what the endpoint
  accepts are in `docs/operations.md`, "Conversations by email".
- **Somewhere for backups**: a bucket at another provider, ideally with
  object lock (see "Backups").

## Quick start

1. **DNS.** At your DNS provider, point four records at the server, with no
   proxy in front:

   ```
   A  example.com      203.0.113.10
   A  *.example.com    203.0.113.10
   A  example.net      203.0.113.10
   A  *.example.net    203.0.113.10
   ```

   Add `AAAA` records only after giving Docker IPv6 (see "IPv6"). If the
   domains have `CAA` records, allow `letsencrypt.org`.

2. **The files.** On the server, take the two files from the commit you
   will run (the SHA you will set as `IMAGE_TAG`), and lock the
   configuration down:

   ```sh
   mkdir -p ~/farida && cd ~/farida
   ref=main   # or that commit's SHA
   base=https://raw.githubusercontent.com/salamaashoush/faridalms/$ref/deploy/single-server
   curl -fsSLO "$base/compose.yaml" && curl -fsSL "$base/env.example" -o .env
   chmod 600 .env
   ```

3. **The settings.** Fill in `.env`; every line says what it is. Generate
   the secrets on the server:

   ```sh
   openssl rand -hex 32     # POSTGRES_PASSWORD, CELL_ROLE_PASSWORD, S3_SECRET_ACCESS_KEY
   openssl rand -hex 16     # S3_ACCESS_KEY_ID
   openssl rand -base64 32  # CELL_KEK, CELL_SECRET
   ```

   Set `IMAGE_TAG` to the commit you are running, your two domains, the
   server's address in `EDGE_IPV4`, the country your data is kept in as
   `CELL_JURISDICTION`, and the email gateway. Then copy `.env` into a
   password manager: the backups do not carry it, and without `CELL_KEK` a
   restored server cannot read its encrypted fields.

4. **Start.**

   ```sh
   docker compose up -d
   docker compose ps
   ```

   `migrate` creates the databases, applies the migrations and lists this
   server's cell as open, then exits 0; everything else should be `healthy`
   within a minute or two.

5. **The first school.** Create it from the shell:

   ```sh
   docker compose run --rm admin create-school \
     --slug acme --name "Acme School" --country EG --time-zone Africa/Cairo \
     --admin-email head@acme.example --admin-name "Amira Hassan"
   ```

   Its administrator is emailed a link to choose a password, and the school
   is at `https://acme.example.com`, with its website at
   `https://acme.example.net`. `--print-link` prints the email instead of
   sending it, and `admin invite --slug acme` sends a new link when the
   first has expired. Add `--name-ar` and `--admin-name-ar` for Arabic
   names, and `--locale ar` to start the school in Arabic.

   The first visit to each name takes a few seconds while its certificate is
   issued. Caddy asks the API before every certificate, and only the names
   of schools that exist, and the edge's own, are ever issued.

From here the school's administrator does the rest in the portal: the school
year, classes, people, and, under Settings, the school's own domain names
for its portal and website.

## Options

**An S3 service for files.** The `storage` profile runs a file store on the
server (SeaweedFS), and its files live in the `storage` volume, which the
nightly backup copies to your backup bucket. To use an S3 service instead,
make two private buckets there, set `S3_ENDPOINT`, `S3_REGION`,
`S3_ADDRESSING_STYLE` and the keys, and remove `storage` from
`COMPOSE_PROFILES`. Hetzner Object Storage, for one, takes
`S3_ADDRESSING_STYLE=virtual`.

**Wildcard certificates.** With `EDGE_TLS=acme` each name gets its own
certificate from Let's Encrypt, which allows 50 new ones a week per domain:
plenty for a few schools. For many, set `EDGE_TLS=cloudflare` and
`CLOUDFLARE_API_TOKEN` (Zone, DNS, Edit and Zone, Zone, Read on both zones,
the domains' DNS at Cloudflare): two wildcard certificates by DNS-01 then
cover every name. A token limited to the server's IPv4 address must be
called from the server with `curl -4`, since the host prefers IPv6.

**The operator console.** For running many schools, add `console` to
`COMPOSE_PROFILES`. The console at `https://ops.example.com` creates schools,
binds their domains and keeps a log of every change, signed in through any
OpenID Connect provider:

1. Create a client of type "Web application" whose authorised redirect URI
   is `https://ops.example.com/auth/callback`. With Google: a project in the
   Google Cloud console, an OAuth consent screen (External, the scopes
   `openid`, `email` and `profile`), then Credentials, OAuth client ID.
2. Set `OPS_OIDC_ISSUER`, `OPS_OIDC_CLIENT_ID`, `OPS_OIDC_CLIENT_SECRET`,
   and who may sign in: `OPS_OIDC_EMAILS` (verified addresses), or
   `OPS_OIDC_GROUP` with a provider that has groups. Set `PROVISION_SECRET`
   and `OPS_SESSION_SECRET` (`openssl rand -base64 32` each).
3. `docker compose up -d`.

## Routing

| Name                                | Service         |
| ----------------------------------- | --------------- |
| `example.com`, `<slug>.example.com` | web:3000        |
| `www.example.com`                   | 308 to the apex |
| `ops.example.com`                   | ops:3004        |
| `collab.example.com` (WebSocket)    | collab:3002     |
| `api.example.com`                   | api:3001        |
| `example.net`, `<slug>.example.net` | web:3000        |
| `files.example.net`                 | api:3003        |
| `play.example.net`                  | 308 to `files.` |
| `media.example.net`                 | media:3104      |
| a school's own name                 | web:3000        |

`files.` is `FILES_ORIGIN` and `PLAY_URL` both: the play page, the coding
studio and the micro:bit editor are served by the API's files host, and the
play page names that host in its policy, which Safari needs for a page with
no origin. The `play.` name redirects there and serves nothing itself. Every label above is reserved, so
no school can take it as its slug.

`api.example.com` is for native clients (the repository's README, "API");
the web calls the
API inside the network. The edge answers 404 there for `/edge/ask`, the
question Caddy asks before it issues a certificate for a school's own name,
which is asked on the internal network only.

Nothing stands in front of the edge, so Caddy trusts no proxy: it replaces
any `X-Forwarded-For` a client sends with the address it connected from,
which is the entry the apps read with `TRUSTED_PROXY_HOPS=1`. Platform names
get HSTS with `includeSubDomains`; a school's own name gets the web's, which
leaves the school's other subdomains alone. Request bodies stop at 32 MB:
uploads above 8 MiB go in 8 MiB parts, smaller ones whole, up to
`MAX_UPLOAD_BYTES` (25 MiB).

## Resources

Limits are ceilings for when something runs away, not what a service uses:
idle, the whole stack takes under 500 MB (`smoke.sh` prints it). Together
they come to a little over the 8 GB of RAM, which is safe because they never
all peak at once, and the 4 GB of swap is the headroom.

- `postgres` 3 GB: `shared_buffers` 1.5 GB, `effective_cache_size` 4 GB
  (the planner's estimate of the page cache), `work_mem` 16 MB,
  `max_connections` 100 (the pools add up to about 55, and an upgrade can
  briefly run two APIs). Statements over 500 ms are logged.
- `media` 2 GB and 2 of the 4 CPUs, so an encode cannot starve the API or
  the database. It and `backup` are the first the kernel stops if memory
  runs out; Postgres is the last.
- `api` 1 GB (it marks Python exercises in up to 256 MiB each), `web`
  512 MB, `backup` 512 MB and 1 CPU (rclone holds a bucket's listing in
  memory, about 1 KB an object), `migrate` 512 MB while it runs,
  `provisioner`, `collab` and `ops` 384 MB, `edge` 256 MB.

Every container logs to Docker's json-file driver, 5 files of 20 MB, so
logs cannot take more than about 1 GB of the disk.

## Upgrades

CI publishes every target for every commit on main that passes its checks,
tagged with the commit SHA and `main`. To upgrade, take that commit's
`compose.yaml`, set `IMAGE_TAG` in `.env` to its SHA, then:

```sh
docker compose pull
docker compose up -d
```

`migrate` runs again before anything that reads the cell starts, and
applies the pending migrations. Each service is then replaced one at a time:
the old container drains for up to 30 seconds and the new one starts, so
the API, the web and collab are each unreachable for a few seconds (the
edge answers 502 meanwhile, and editors reconnect). That is the cost of one
replica of each; nothing is lost. Certificates live in the `caddy-data`
volume and survive every upgrade.

## Rollback

Set `IMAGE_TAG` back to the previous SHA and run the same two commands.
Migrations are not undone: they follow expand and contract
(docs/systems/platform-foundation.md, migration rules), so the previous
release runs against the newer schema. A release that contracts (drops what
the one before it used) says so, and is not rolled back past without a
database restore (`restore.md`).

## Day to day

- Logs: `docker compose logs -f --since 1h api` (or `web`, `edge`, ...).
  The edge's access log is JSON on stdout, with each path cut to its first
  segment, since the rest of a file, stream or feed address is its token.
  The files are under `/var/lib/docker/containers/`, rotated as above.
- Health: `docker compose ps`. The `backup` service turns unhealthy when its
  last run failed.
- psql through an SSH tunnel, as Postgres listens on the server's loopback
  only:

  ```sh
  ssh -N -L 5432:127.0.0.1:5432 deploy@203.0.113.10 &
  psql "postgres://postgres:$POSTGRES_PASSWORD@127.0.0.1:5432/cell"
  ```

- Disk: `df -h /`, `docker system df`. Old images pile up with each
  upgrade; `docker image prune` removes the untagged ones. Keep the
  previous release's images for a rollback.
- Memory: `free -h`, `swapon --show`, `docker stats --no-stream`.
- A shell for an incident: `docker compose exec api sh`.

## Backups

The `backup` service runs every night at `BACKUP_AT` (UTC, default 02:30):
`pg_dump -Fc` of `cell` and `directory` as the `backup_dump` login, the
roles without their passwords, and a copy of both file buckets, to one
bucket at another provider:

- `db/<date>/cell.dump`, `db/<date>/directory.dump`, `db/<date>/roles.sql`
  and `db/<date>/SHA256SUMS`;
- `files/<FILE_BUCKET>/...` and `files/<PUBLIC_MEDIA_BUCKET>/...`, to which
  each night adds what is new or changed.

Until the five `BACKUP_S3_*` settings are set it logs that it is not
configured and does nothing. With Backblaze B2:

1. Create a private bucket with Object Lock on and a default retention
   (30 days, say), and a lifecycle rule that cancels unfinished large files
   after a day.
2. Create an application key for that bucket alone with `listBuckets`,
   `listFiles`, `readFiles` and `writeFiles`, and without `deleteFiles`:
   the job never deletes, and a key that cannot delete cannot destroy the
   backups either.
3. Set `BACKUP_S3_ENDPOINT` (`https://s3.<region>.backblazeb2.com`),
   `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID` (the
   key ID) and `BACKUP_S3_SECRET_ACCESS_KEY`, then
   `docker compose up -d backup` and `docker compose run --rm backup run`.

The dumps are a day apart at most, so a restore can lose up to a day of
work. Restoring is in `restore.md`. The platform's rule that `backup_dump`
connects only with a client certificate (docs/systems/platform-foundation.md,
section 4.2) is not applied here, where the job runs beside Postgres on its
private network with the cell's role password.

## IPv6

Docker's port publishing keeps a client's IPv4 address, which the sign-in
and enquiry limits are keyed on. Over IPv6 to an IPv4-only network it
proxies instead, and every IPv6 client arrives as the same address. Before
publishing `AAAA` records, enable IPv6 on the `front` network
(`enable_ipv6: true`) and check with a request from an IPv6 address that
the edge's access log shows it.

## HSTS preload

Once every name under both domains has served HTTPS for a while, you may
add `; preload` to the edge's `Strict-Transport-Security` and submit both
domains at hstspreload.org. Leaving the list takes months, so it is a
decision, not a setting.

## On a workstation

`smoke.sh` runs this stack as a self-hosted server runs it, with locally
built images, the bundled file store, the console, and certificates issued
on demand by Caddy's own authority. It checks the cell's listing, a school
created from the shell and its certificate, routing, health, the store, the
network boundaries, log rotation, a backup to MinIO and a restore, and
removes everything it started:

```sh
for t in api web collab ops migrate media edge backup; do
  docker build --target "$t" -t "faridalms-$t:local" .
done
deploy/single-server/smoke.sh
```

Let's Encrypt and Cloudflare issuance, sign-in through a real identity
provider, a real S3 service and a real backup bucket are what it cannot
exercise.
