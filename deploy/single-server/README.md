# Single-server deployment

One cell on one machine: Postgres, the API, the web, collaboration, the
media service, the operator console with its provisioner, the edge (Caddy)
and a nightly backup, all from images CI publishes. The production machine
is a Hetzner CAX21 (4 Arm64 vCPU, 8 GB, 80 GB disk, 4 GB swap) running
Docker as the `deploy` user, behind a cloud firewall that admits TCP 22, 80
and 443, UDP 443 and ICMP.

What is here:

- `compose.yaml`: the stack. The only file the server needs besides `.env`.
- `env.example`: every setting, with how to generate each secret.
- `env.op`: the production `.env` as references into 1Password, for
  `op inject`.
- `Caddyfile`, `backup.sh`: built into the `edge` and `backup` images, so
  the routing and the backup move with the image tag.
- `restore.md`: restoring the databases and the files, as `smoke.sh` tests it.
- `compose.local.yaml`, `smoke.sh`: the same stack on a workstation, checked
  end to end.

## Routing

| Name                                      | Service         |
| ----------------------------------------- | --------------- |
| `faridalms.com`, `<slug>.faridalms.com`   | web:3000        |
| `www.faridalms.com`                       | 308 to the apex |
| `ops.faridalms.com`                       | ops:3004        |
| `collab.faridalms.com` (WebSocket)        | collab:3002     |
| `api.faridalms.com`                       | api:3001        |
| `faridalms.site`, `<slug>.faridalms.site` | web:3000        |
| `files.faridalms.site`                    | api:3003        |
| `play.faridalms.site`                     | 308 to `files.` |
| `media.faridalms.site`                    | media:3104      |
| a school's own name                       | web:3000        |

`files.` is `FILES_ORIGIN` and `PLAY_URL` both: the play page, the coding
studio and the micro:bit editor are served by the API's files host, and the
play page names that host in its policy, which Safari needs for a page with
no origin. The `play.` name redirects there and serves nothing itself. Every label above is reserved, so
no school can take it as its slug.

`api.faridalms.com` is for native clients (the repository's README, "API");
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

   - `A faridalms.com` and `A *.faridalms.com` to `203.0.113.10`
   - `A faridalms.site` and `A *.faridalms.site` to `203.0.113.10`

   Add the matching `AAAA` records only after giving Docker IPv6 (see
   "IPv6" below); without it every IPv6 visitor would share one address in
   the sign-in limits. Leave the `CAA` records unset, or allow
   `letsencrypt.org`.

2. **Cloudflare API token**: My Profile, API Tokens, Create Token, "Edit
   zone DNS" template; permissions Zone, DNS, Edit and Zone, Zone, Read;
   zone resources `faridalms.com` and `faridalms.site` only. Caddy uses it
   to answer the DNS-01 challenge for the two wildcard certificates.

3. **Hetzner Object Storage**: in the Cloud Console, in Helsinki, create the
   buckets `faridalms-files` and `faridalms-media`, both private, and an S3
   key pair. The keys go in `.env` and nowhere else.

4. **Google sign-in for the console** (the operator signs in with a Google
   account):

   1. In the Google Cloud console, create a project, then APIs and Services,
      OAuth consent screen: user type External, app name "Farida LMS
      operators", the scopes `openid`, `email` and `profile`, which need no
      verification. While the app is in Testing, add your own address as a
      test user, or publish it.
   2. Credentials, Create credentials, OAuth client ID, type Web application,
      authorised redirect URI `https://ops.faridalms.com/auth/callback`
      (the console's `/auth/callback` route; nothing else).
   3. Put the client ID and secret in `.env` with
      `OPS_OIDC_ISSUER=https://accounts.google.com` and your address in
      `OPS_OIDC_EMAILS`. The console admits an address only when Google
      marks it verified (`email_verified`), and leaves `OPS_OIDC_GROUP`
      unset, since a personal Google account has no groups.

5. **A token to pull images**: the repository is private, so its packages
   are too. Create a classic personal access token with only
   `read:packages`, for the server alone.

On the server, as `deploy`:

6. Copy the stack across:

   ```sh
   ssh deploy@203.0.113.10 mkdir -p farida
   scp deploy/single-server/compose.yaml deploy@203.0.113.10:farida/
   ```

7. Render `.env` from 1Password straight onto the server, so the secrets
   never touch the workstation's disk. `env.op` names every field of the
   "Faridalms" item; the generated secrets already live there, so a
   redeploy renders the same values (a new `CELL_KEK` would make the cell
   unreadable):

   ```sh
   { op inject -i deploy/single-server/env.op
     echo "IMAGE_TAG=$(git rev-parse origin/main)"
   } | ssh deploy@203.0.113.10 'umask 077 && cat > farida/.env'
   ```

   For a server without the item, copy `env.example` instead and generate
   each secret there:

   ```sh
   openssl rand -hex 32     # POSTGRES_PASSWORD, CELL_ROLE_PASSWORD
   openssl rand -base64 32  # CELL_KEK, CELL_SECRET, PROVISION_SECRET, OPS_SESSION_SECRET
   ```

   Either way the email gateway (`RESEND_API_KEY` with `EMAIL_FROM`, or
   `EMAIL_WEBHOOK_URL`) must be set: without it nobody can be invited or
   reset a password, and the console cannot create a school. The backups do
   not carry `.env`, and without `CELL_KEK` a restored cell cannot read its
   encrypted fields.

8. Log in to the registry and start:

   ```sh
   op read "op://<vault>/<item>/<registry token>" |
     ssh deploy@203.0.113.10 docker login ghcr.io -u salamaashoush --password-stdin
   ssh deploy@203.0.113.10
   cd farida
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
     values ('eu-1', 'FI', 'hetzner', 'hel1', 'faridalms.com', 'http://api:3001', 'open')
     on conflict (id) do nothing"
   ```

   Use the `CELL_ID` and `PORTAL_DOMAIN` from `.env`.

10. Create the first school: open `https://ops.faridalms.com`, sign in with
    Google, New school. The provisioner creates it and emails its first
    administrator a link to choose a password (docs/operations.md,
    "Registering a school"). The school's portal is then
    `https://<slug>.faridalms.com` and its website
    `https://<slug>.faridalms.site`.

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
