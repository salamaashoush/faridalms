# Restoring a cell

The backup bucket holds, for each night, `db/<date>/` with a custom-format
dump of `cell` and of `directory`, the cluster's roles without passwords
(`roles.sql`, for comparison) and `SHA256SUMS`; and under `files/` a copy of
each file bucket. `smoke.sh` runs these steps against MinIO on every run of
it and checks that the restored cell holds the same rows, that the seeded
principal signs in and that a file uploaded before the backup still opens.

Run everything from the deployment folder on the server (`~/farida`), with
its `.env`. The dumps carry no secrets and no keys: the cell's encrypted
fields open only with the `CELL_KEK` of the `.env` that wrote them, so a
restore onto a new server starts from the `.env` kept in the password
manager.

Nothing here deletes the current databases. They are renamed aside and kept
until the restored cell has been checked.

## The databases, on the same server

1. Choose the night (`YYYY-MM-DD`, UTC) and list what the bucket holds:

   ```sh
   docker compose run --rm backup rclone lsl "backup:<backup bucket>/db/2026-11-01"
   ```

2. Fetch it into a volume of its own; the checksums are checked as it
   lands:

   ```sh
   docker compose run --rm --user root -v farida-restore:/restore backup fetch 2026-11-01 /restore
   ```

3. Stop everything that writes, and set the current databases aside:

   ```sh
   docker compose stop api web collab media provisioner ops backup
   docker compose exec postgres psql -U postgres -d postgres \
     -c "alter database cell rename to cell_before_restore" \
     -c "alter database directory rename to directory_before_restore"
   ```

4. Make sure every role exists with the passwords in `.env` (roles are
   cluster objects, outside the dumps; this is the step a new server
   needs), then restore each database as it was dumped, its owner, grants
   and settings included:

   ```sh
   docker compose run --rm migrate bun migrate.js provision
   export PGPASSWORD=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env)
   for database in cell directory; do
     docker compose run --rm -v farida-restore:/restore -e PGUSER=postgres -e PGPASSWORD \
       --entrypoint pg_restore backup --create --exit-on-error --dbname=postgres "/restore/$database.dump"
   done
   unset PGPASSWORD
   ```

5. Copy back the objects deleted since the dump ("The files" below), then
   start the stack. `migrate` applies whatever migrations came after the
   dump, then the services come up:

   ```sh
   docker compose up -d
   docker compose ps
   ```

6. Check a school signs in, then drop what was set aside and the volume:

   ```sh
   docker compose exec postgres psql -U postgres -d postgres \
     -c "drop database cell_before_restore" -c "drop database directory_before_restore"
   docker volume rm farida-restore
   ```

The dumps leave out unlogged tables' rows, so sign-in counters and the like
start empty.

## Onto a new server

Prepare the server as in README.md, copy `compose.yaml` and the `.env` from
the password manager, log in to the registry, then start Postgres alone:

```sh
docker compose up -d postgres
```

Follow steps 1, 2, 4 and 5 above; there is nothing to set aside. Point the
DNS records at the new address and set `EDGE_IPV4` to it before step 5. The
edge issues its certificates again on start (a new server starts with an
empty `caddy-data` volume), which Let's Encrypt allows a few times a week
for the same names.

## The files

A restored database refers to every object it referred to on the night of
the dump, and the API may have deleted some of those since, sweeping files
as unreferenced or rejected. The backup copy never deletes, so it still has
them. After a database restore, and when the Hetzner buckets themselves are
lost, copy back what is missing; nothing that is there is touched, and
objects uploaded after the dump stay, unreferenced:

```sh
docker compose stop api media
docker compose run --rm backup rclone copy --checksum \
  "backup:<backup bucket>/files/faridalms-files" files:faridalms-files
docker compose run --rm backup rclone copy --checksum \
  "backup:<backup bucket>/files/faridalms-media" files:faridalms-media
docker compose up -d
```

`backup:` is the backup bucket's provider and `files:` the file store, both
configured from `.env`. To restore into new buckets, create them, set
`FILE_BUCKET` and `PUBLIC_MEDIA_BUCKET` to their names and copy into those.

A bucket copy keeps what each object was on the night it was copied; the
bucket's object lock keeps older versions for its retention period, which
the provider's console can bring back one object at a time.
