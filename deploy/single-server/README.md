# Single-server deployment

One cell on one machine: Postgres, the API, the web, collaboration, the
media service, the operator console with its provisioner, the edge (Caddy)
and a nightly backup, all from images CI publishes. It is sized for a
machine with 4 vCPU, 8 GB of memory, 80 GB of disk and 4 GB of swap (a
Hetzner CAX21, say), running Docker as a `deploy` user behind a firewall
that admits TCP 22, 80 and 443, UDP 443 and ICMP.

The examples use `example.com` for `PORTAL_DOMAIN`, `example.net` for
`SITES_DOMAIN` and `203.0.113.10` for the server; put your own in their
place.

What is here:

- `compose.yaml`: the stack. The only file the server needs besides `.env`.
- `env.example`: every setting, with how to generate each secret.
- `Caddyfile`, `backup.sh`: built into the `edge` and `backup` images, so
  the routing and the backup move with the image tag.
- `restore.md`: restoring the databases and the files, as `smoke.sh` tests it.
- `compose.local.yaml`, `smoke.sh`: the same stack on a workstation, checked
  end to end.

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

## First deploy

On a workstation, with this repository:

1. **DNS at Cloudflare**, every record DNS only (grey cloud, no proxy):

   - `A example.com` and `A *.example.com` to `203.0.113.10`
   - `A example.net` and `A *.example.net` to `203.0.113.10`

   Add the matching `AAAA` records only after giving Docker IPv6 (see
   "IPv6" below); without it every IPv6 visitor would share one address in
   the sign-in limits. Leave the `CAA` records unset, or allow
   `letsencrypt.org`.

2. **Cloudflare API token**: My Profile, API Tokens, Create Token, "Edit
   zone DNS" template; permissions Zone, DNS, Edit and Zone, Zone, Read;
   zone resources `example.com` and `example.net` only. Caddy uses it
   to answer the DNS-01 challenge for the two wildcard certificates. If the
   token is limited to the server's IPv4 address, call the API from the
   server's own shell with `curl -4`: the host prefers IPv6, which the
   token refuses (containers have IPv4 only, so Caddy is unaffected).

3. **Object storage**: create two private buckets, `faridalms-files` and
   `faridalms-media`, and an S3 key pair (with Hetzner Object Storage, in
   the Cloud Console; `env.example` has its endpoint). The keys go in `.env` and nowhere else.

4. **Google sign-in for the console** (the operator signs in with a Google
   account):

   1. In the Google Cloud console, create a project, then APIs and Services,
      OAuth consent screen: user type External, app name "Farida LMS
      operators", the scopes `openid`, `email` and `profile`, which need no
      verification. While the app is in Testing, add your own address as a
      test user, or publish it.
   2. Credentials, Create credentials, OAuth client ID, type Web application,
      authorised redirect URI `https://ops.example.com/auth/callback`
      (the console's `/auth/callback` route; nothing else).
   3. Put the client ID and secret in `.env` with
      `OPS_OIDC_ISSUER=https://accounts.google.com` and your address in
      `OPS_OIDC_EMAILS`. The console admits an address only when Google
      marks it verified (`email_verified`), and leaves `OPS_OIDC_GROUP`
      unset, since a personal Google account has no groups.

5. **A token to pull images**, if the images are private: a classic
   personal access token with only `read:packages`, for the server alone.

On the server, as `deploy`:

6. Copy the stack across and lock the configuration down:

   ```sh
   ssh deploy@203.0.113.10 mkdir -p farida
   scp deploy/single-server/compose.yaml deploy/single-server/env.example deploy@203.0.113.10:farida/
   ssh deploy@203.0.113.10
   cd farida
   cp env.example .env && chmod 600 .env
   ```

7. Fill in `.env`. Generate each secret on the server:

   ```sh
   openssl rand -hex 32     # POSTGRES_PASSWORD, CELL_ROLE_PASSWORD
   openssl rand -base64 32  # CELL_KEK, CELL_SECRET, PROVISION_SECRET, OPS_SESSION_SECRET
   ```

   Set `IMAGE_TAG` to the commit to run, `EDGE_IPV4` to the server's
   address, and the email gateway (`RESEND_API_KEY` with `EMAIL_FROM`, or
   `EMAIL_WEBHOOK_URL`): without it nobody can be invited or reset a
   password, and the console cannot create a school. Then copy `.env` into a
   password manager. The backups do not carry it, and without `CELL_KEK` a
   restored cell cannot read its encrypted fields. A password manager with a
   CLI can render it instead (`op inject` from a template of references, for
   instance), so the secrets never sit on a workstation's disk.

8. Log in to the registry if the images are private, and start:

   ```sh
   echo "$TOKEN" | docker login ghcr.io -u <account> --password-stdin
   docker compose pull
   docker compose up -d
   docker compose ps
   ```

   `migrate` runs first and exits 0; everything else should show `healthy`
   within a minute. The edge asks for the two wildcard certificates as it
   starts (`docker compose logs edge | grep -i certificate`).

9. Register the cell in the directory, once. The console offers schools
   only on a registered cell, and its host must be the bare portal domain:

   ```sh
   docker compose exec postgres psql -U postgres -d directory -c "
     insert into cells (id, jurisdiction, provider, region, app_host, api_base_url, state)
     values ('eu-1', 'FI', 'hetzner', 'hel1', 'example.com', 'http://api:3001', 'open')
     on conflict (id) do nothing"
   ```

   Use the `CELL_ID` and `PORTAL_DOMAIN` from `.env`, the two-letter
   country the data lives in, and the provider and region of the server.

10. Create the first school: open `https://ops.example.com`, sign in with
    Google, New school. The provisioner creates it and emails its first
    administrator a link to choose a password (docs/operations.md,
    "Registering a school"). The school's portal is then
    `https://<slug>.example.com` and its website
    `https://<slug>.example.net`.

11. Configure backups (below) and run one by hand.

## Upgrades

CI publishes every target for every commit on main, tagged with the commit
SHA and `main`. To upgrade, set `IMAGE_TAG` in `.env` to the new SHA, then:

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
- `files/faridalms-files/...` and `files/faridalms-media/...`, to which
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

The plan is to preload both platform domains. Once every name under them
has served HTTPS for a while, add `; preload` to the edge's
`Strict-Transport-Security` and submit both at hstspreload.org. Leaving the
list takes months, so it is a decision, not a setting.

## On a workstation

`smoke.sh` runs this stack with locally built images, `tls internal` for the
platform names and MinIO for the buckets, checks routing, health, the
store, the network boundaries, log rotation, a backup and a restore, and
removes everything it started:

```sh
for t in api web collab ops migrate media edge backup; do
  docker build --target "$t" -t "faridalms-$t:local" .
done
deploy/single-server/smoke.sh
```

The Cloudflare DNS-01 issuance, Google sign-in, Hetzner's own endpoint and
a real backup bucket are what it cannot exercise.
