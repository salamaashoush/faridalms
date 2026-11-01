#!/usr/bin/env bash
# Runs the single-server stack on a workstation and checks it end to end, as
# a self-hosted server runs it: the bundled file store and the console
# profiles, certificates on demand, the migration listing the cell, a school
# created from the shell, every service's health, routing through the edge,
# the store, the network boundaries, log rotation, a backup to MinIO (the
# stand-in for another provider's bucket) and a restore from it. Everything it starts, volumes included, is removed when
# it ends. It needs the images built locally first:
#
#   for t in api web collab ops migrate media edge backup; do
#     docker build --target $t -t faridalms-$t:local .
#   done
#   deploy/single-server/smoke.sh
#
# It seeds the stack's own cell with the development seed, which needs bun
# and the repository's dependencies; it never touches the development
# databases, which live in another cluster. SMOKE_LOGS names a folder to
# keep the run's logs in.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
project=farida-smoke
portal=faridalms.test
sites=faridalms-site.test
port=58443
work=$(mktemp -d)
env="$work/env"
failures=0

secret() { openssl rand -base64 32; }
hex() { openssl rand -hex 32; }
S3_ACCESS_KEY_ID=$(hex | cut -c1-20)
S3_SECRET_ACCESS_KEY=$(hex)
POSTGRES_PASSWORD=$(hex)
CELL_ROLE_PASSWORD=$(hex)
CELL_KEK=$(secret)
CELL_ID=eu-1
cat >"$env" <<EOF
COMPOSE_PROFILES=storage,console
IMAGE_PREFIX=faridalms
IMAGE_TAG=local
PORTAL_DOMAIN=$portal
SITES_DOMAIN=$sites
EDGE_IPV4=192.0.2.10
CELL_ID=$CELL_ID
CELL_JURISDICTION=EG
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
CELL_ROLE_PASSWORD=$CELL_ROLE_PASSWORD
CELL_KEK=$CELL_KEK
CELL_SECRET=$(secret)
PROVISION_SECRET=$(secret)
OPS_SESSION_SECRET=$(secret)
CLOUDFLARE_API_TOKEN=0000000000000000000000000000000000000000
EDGE_LOG_LEVEL=DEBUG
S3_ENDPOINT=http://storage:8333
S3_REGION=us-east-1
S3_ADDRESSING_STYLE=path
S3_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY
FILE_BUCKET=faridalms-files
PUBLIC_MEDIA_BUCKET=faridalms-media
OPS_OIDC_CLIENT_ID=smoke
OPS_OIDC_CLIENT_SECRET=smoke
OPS_OIDC_EMAILS=salama@example.com
EMAIL_WEBHOOK_URL=memory:
EOF

compose() {
  docker compose -p "$project" -f "$here/compose.yaml" -f "$here/compose.local.yaml" --env-file "$env" "$@"
}
cleanup() {
  [[ -z "${SMOKE_LOGS:-}" ]] || cp "$work"/*.log "$SMOKE_LOGS"/ 2>/dev/null || true
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  docker volume rm "${project}_restore" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

checks=0
check() {
  local label=$1 log
  shift
  checks=$((checks + 1))
  log="$work/check-$checks.log"
  if "$@" >"$log" 2>&1; then
    echo "ok   $label"
  else
    echo "FAIL $label ($(basename "$log"))"
    sed 's/^/     /' "$log" | tail -20
    failures=$((failures + 1))
  fi
}

# curl through the edge as a browser would reach it.
edge() {
  local host=$1
  shift
  curl -sk --resolve "$host:$port:127.0.0.1" "$@" "https://$host:$port"
}
status() { edge "$1" -o /dev/null -w '%{http_code}' "${@:2}"; }
expect_status() {
  local want=$1 got
  got=$(status "${@:2}")
  echo "status $got"
  [[ "$got" == "$want" ]]
}

# S3 calls to MinIO, signed with the root key, from inside the stack.
s3() {
  docker run --rm --network "${project}_front" curlimages/curl:8.17.0 -sf \
    --aws-sigv4 "aws:amz:us-east-1:s3" --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" "$@"
}

psql_cell() { compose exec -T postgres psql -U postgres -At "$@"; }

echo "Starting MinIO and the backup bucket..."
compose up -d --wait minio >/dev/null
# The backup bucket keeps every version under object lock, as the real one.
s3 -X PUT -H "x-amz-bucket-object-lock-enabled: true" http://minio:9000/backups >/dev/null
lock='<ObjectLockConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><ObjectLockEnabled>Enabled</ObjectLockEnabled><Rule><DefaultRetention><Mode>GOVERNANCE</Mode><Days>1</Days></DefaultRetention></Rule></ObjectLockConfiguration>'
s3 -X PUT "http://minio:9000/backups?object-lock" \
  -H "Content-MD5: $(printf '%s' "$lock" | openssl md5 -binary | base64)" --data "$lock" >/dev/null

echo "Starting the stack..."
compose up -d --wait --wait-timeout 300 >/dev/null || true

echo "== Services"
check "migrate ran and exited 0" test "$(docker inspect -f '{{.State.ExitCode}}' "$project-migrate-1")" = 0
check "the store's buckets were made" test "$(docker inspect -f '{{.State.ExitCode}}' "$project-storage-buckets-1")" = 0
for service in postgres storage api web collab media provisioner ops edge backup; do
  check "$service is healthy" test "$(docker inspect -f '{{.State.Health.Status}}' "$project-$service-1")" = healthy
done

echo "== A school from the shell"
cell_listed() {
  local row
  row=$(psql_cell -d directory -c "select state || ' ' || app_host || ' ' || jurisdiction from cells where id = '$CELL_ID'")
  echo "$row"
  [[ "$row" == "open $portal EG" ]]
}
create_school() {
  compose run --rm -T admin create-school --slug smoke-school --name 'Smoke School' \
    --admin-email head@smoke.example --admin-name 'Amira Hassan' --country EG \
    --time-zone Africa/Cairo --print-link
}
# grep without -q reads to the end, so tee never meets a closed pipe.
school_created() { create_school | tee /dev/stderr | grep "https://smoke-school.$portal/welcome" >/dev/null; }
second_refused() {
  local out
  if out=$(create_school 2>&1); then return 1; fi
  echo "$out"
  grep -q 'already has the code smoke-school' <<<"$out"
}
invited() {
  compose run --rm -T admin invite --slug smoke-school --print-link | tee /dev/stderr |
    grep "https://smoke-school.$portal/welcome" >/dev/null
}
own_certificate() {
  echo | openssl s_client -connect "127.0.0.1:$port" -servername "smoke-school.$portal" 2>/dev/null |
    openssl x509 -noout -ext subjectAltName | tee /dev/stderr | grep "DNS:smoke-school.$portal" >/dev/null
}
check "migrate listed the cell as open" cell_listed
check "create-school makes a school and prints its link" school_created
check "a second create-school with the same code is refused" second_refused
check "invite sends its administrator a new link" invited
check "its portal gets a certificate for its own name on the first visit" own_certificate
check "its portal serves its sign-in page" bash -c "
  curl -sk --resolve smoke-school.$portal:$port:127.0.0.1 https://smoke-school.$portal:$port/sign-in | grep -qi 'password'"
check "a code no school holds gets no certificate" bash -c "
  ! curl -sk --max-time 5 --resolve nobody-here.$portal:$port:127.0.0.1 https://nobody-here.$portal:$port/ -o /dev/null"

echo "== Seeding the stack's own cell"
(
  cd "$work"
  NODE_ENV=development \
    DATABASE_ADMIN_URL="postgres://postgres:$POSTGRES_PASSWORD@127.0.0.1:55432/postgres" \
    CELL_DATABASE=cell DIRECTORY_DATABASE=directory \
    CELL_ROLE_PASSWORD="$CELL_ROLE_PASSWORD" CELL_KEK="$CELL_KEK" CELL_ID="$CELL_ID" \
    CELL_APP_HOST="$portal" \
    bun "$repo/scripts/db.ts" seed >"$work/seed.log" 2>&1
) || {
  cat "$work/seed.log"
  exit 1
}
echo "ok   seeded"

echo "== Routing"
check "a portal serves its sign-in page" bash -c "
  html=\$(curl -sk --resolve northwind.$portal:$port:127.0.0.1 https://northwind.$portal:$port/sign-in)
  grep -q '<html' <<<\"\$html\" && grep -qi 'password' <<<\"\$html\""
check "the bare portal domain answers" expect_status 200 "$portal" -L
check "www redirects to the bare domain" expect_status 308 "www.$portal"
check "a website answers 404 to an app route" bash -c "
  [[ \$(curl -sk -o /dev/null -w '%{http_code}' --resolve northwind.$sites:$port:127.0.0.1 https://northwind.$sites:$port/sign-in) == 404 ]] &&
  [[ \$(curl -sk -o /dev/null -w '%{http_code}' --resolve northwind.$sites:$port:127.0.0.1 https://northwind.$sites:$port/admin) == 404 ]]"
# Certificates come on demand here, so a label the edge does not serve on
# the portal domain gets none; with wildcard certificates it answers 404.
check "a reserved label is no school's portal" bash -c "
  ! curl -sk --max-time 5 -o /dev/null --resolve media.$portal:$port:127.0.0.1 https://media.$portal:$port/sign-in"
check "ops serves the console's sign-in" bash -c "
  curl -sk --resolve ops.$portal:$port:127.0.0.1 https://ops.$portal:$port/sign-in | grep -q 'Operator console'"
check "collab upgrades a WebSocket" bash -c "
  curl -sk --http1.1 --max-time 3 -o /dev/null -w '%{http_code}' --resolve collab.$portal:$port:127.0.0.1 \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
    -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' https://collab.$portal:$port/ | grep -q 101"
check "the files host serves the play page" bash -c "
  curl -sk -D - -o /dev/null --resolve files.$sites:$port:127.0.0.1 https://files.$sites:$port/play | grep -qi \"content-security-policy: default-src 'none'\""
check "play redirects to the files host" bash -c "
  curl -sk -D - -o /dev/null --resolve play.$sites:$port:127.0.0.1 https://play.$sites:$port/play | grep -qi 'location: https://files.$sites/play'"
check "media answers its health route" bash -c "
  curl -sk --resolve media.$sites:$port:127.0.0.1 https://media.$sites:$port/health | grep -q ok"
check "the API answers on its host" bash -c "
  curl -sk --resolve api.$portal:$port:127.0.0.1 https://api.$portal:$port/health/ready | grep -q ok"
check "platform hosts send HSTS with subdomains" bash -c "
  curl -sk -D - -o /dev/null --resolve northwind.$portal:$port:127.0.0.1 https://northwind.$portal:$port/sign-in |
    grep -i '^strict-transport-security' | grep -qi 'includeSubDomains'"

echo "== The edge's question"
check "the API answers 404 for an unknown domain" bash -c "
  [[ \$(docker exec $project-api-1 bun -e \"const r = await fetch('http://127.0.0.1:3001/edge/ask?domain=unknown.example.org'); console.log(r.status)\") == 404 ]]"
check "the API host does not expose it" bash -c "
  curl -sk -D - --resolve api.$portal:$port:127.0.0.1 'https://api.$portal:$port/edge/ask?domain=unknown.example.org' |
    tee /dev/stderr | grep -q '^HTTP/2 404' && ! curl -sk --resolve api.$portal:$port:127.0.0.1 'https://api.$portal:$port/edge/ask?domain=x.example.org' | grep -q NOT_FOUND"
check "an unknown domain gets no certificate" bash -c "
  ! curl -sk --max-time 5 --resolve unknown.example.org:$port:127.0.0.1 https://unknown.example.org:$port/ -o /dev/null"

echo "== Client addresses"
check "a client's X-Forwarded-For is replaced, not appended" bash -c "
  curl -sk -o /dev/null --resolve northwind.$portal:$port:127.0.0.1 -H 'X-Forwarded-For: 203.0.113.66' https://northwind.$portal:$port/api/health
  sleep 1
  docker logs $project-edge-1 2>&1 | grep 'upstream roundtrip' | grep '/api/health' | tail -1 > $work/roundtrip.json
  grep -q 'X-Forwarded-For' $work/roundtrip.json && ! grep -q '203.0.113.66' $work/roundtrip.json"

echo "== The store, through the API and the files host"
token=$(curl -sk --resolve "api.$portal:$port:127.0.0.1" -H 'content-type: application/json' -H 'x-farida-school: northwind' \
  --data '{"loginName":"principal.northwind@northwind.example.com","password":"farida-development-password"}' \
  "https://api.$portal:$port/v1/identity/signIn" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
check "the seeded principal signs in" test -n "$token"
api() { curl -sk --resolve "api.$portal:$port:127.0.0.1" -H "authorization: Bearer $token" -H 'x-farida-school: northwind' "$@"; }
body="smoke $(date +%s)"
file=$(api -H 'content-type: application/json' \
  --data "{\"purpose\":\"document_media\",\"name\":\"smoke.txt\",\"mediaType\":\"text/plain\",\"sizeBytes\":${#body}}" \
  "https://api.$portal:$port/v1/files/initiate" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
check "an upload is declared" test -n "$file"
check "its bytes go to the bucket" bash -c "
  [[ \$(curl -sk -o /dev/null -w '%{http_code}' --resolve api.$portal:$port:127.0.0.1 -H 'authorization: Bearer $token' \
    -H 'x-farida-school: northwind' -X PUT --data-binary '$body' https://api.$portal:$port/v1/files/$file/content) == 200 ]]"
check "the object is in the bucket under its school" bash -c "
  docker run --rm --network ${project}_front curlimages/curl:8.17.0 -sf --aws-sigv4 aws:amz:us-east-1:s3 \
    --user '$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY' 'http://storage:8333/faridalms-files?list-type=2' | grep -q '<Key>t/'"
link=$(api -o /dev/null -w '%{redirect_url}' "https://api.$portal:$port/v1/files/$file/content")
check "opening it redirects to the files host" grep -q "^https://files.$sites/" <<<"$link"
check "the files host serves the bytes" bash -c "
  [[ \$(curl -sk --resolve files.$sites:$port:127.0.0.1 '${link/files.$sites/files.$sites:$port}') == '$body' ]]"

echo "== Boundaries"
check "Postgres is published on loopback only" bash -c "
  docker port $project-postgres-1 5432/tcp | tee /dev/stderr | grep -qv '0.0.0.0' &&
  ! docker port $project-postgres-1 5432/tcp | grep -q '0.0.0.0'"
check "the edge cannot reach Postgres" bash -c "! docker exec $project-edge-1 nc -z -w 2 postgres 5432"
check "the API cannot reach the provisioner" bash -c "
  docker exec $project-api-1 bun -e \"await fetch('http://provisioner:3005/v1/tenants', { method: 'POST', signal: AbortSignal.timeout(3000) }).then(() => process.exit(1), () => process.exit(0))\""
check "the console reaches the provisioner, which refuses an unsigned call" bash -c "
  [[ \$(docker exec $project-ops-1 bun -e \"const r = await fetch('http://provisioner:3005/v1/tenants', { method: 'POST' }); console.log(r.status)\") == 401 ]]"
check "every container rotates its log" bash -c "
  for c in \$(docker ps -a --filter label=com.docker.compose.project=$project --format '{{.Names}}'); do
    docker inspect -f '{{.Name}} {{.HostConfig.LogConfig.Type}} {{index .HostConfig.LogConfig.Config \"max-size\"}} {{index .HostConfig.LogConfig.Config \"max-file\"}}' \$c
  done | tee /dev/stderr | awk '\$2 != \"json-file\" || \$3 != \"20m\" || \$4 != \"5\" { bad = 1 } END { exit bad }'"

echo "== Backups"
day=$(date -u +%F)
# Functions run by check sit in an if, where bash ignores set -e, so every
# step is chained.
backup() {
  compose run --rm -T \
    -e BACKUP_S3_ENDPOINT=http://minio:9000 -e BACKUP_S3_REGION=us-east-1 -e BACKUP_S3_BUCKET=backups \
    -e BACKUP_S3_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" -e BACKUP_S3_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
    -e RCLONE_DUMP=headers "$@"
}
unconfigured_backup() {
  compose run --rm -T backup run >"$work/backup-0.log" 2>&1 &&
    cat "$work/backup-0.log" && grep -q 'not configured' "$work/backup-0.log"
}
first_backup() { backup backup run >"$work/backup-1.log" 2>&1 || { tail -30 "$work/backup-1.log"; return 1; }; }
second_backup() {
  backup backup run >"$work/backup-2.log" 2>&1 || { tail -30 "$work/backup-2.log"; return 1; }
  grep -c 'There was nothing to transfer' "$work/backup-2.log"
  [[ $(grep -c 'There was nothing to transfer' "$work/backup-2.log") -ge 2 ]]
}
no_deletes() {
  local requests
  requests=$(cat "$work/backup-1.log" "$work/backup-2.log" | grep -cE 'DEBUG : (GET|HEAD|PUT|POST|DELETE) /')
  echo "$requests requests"
  ((requests > 0)) && ! grep -hE 'DEBUG : (DELETE /|POST [^ ]*\?delete)' "$work/backup-1.log" "$work/backup-2.log"
}
bucket_holds() {
  s3 'http://minio:9000/backups?list-type=2' >"$work/listing.xml" || return 1
  local key
  for key in "db/$day/roles.sql" "db/$day/cell.dump" "db/$day/directory.dump" "db/$day/SHA256SUMS" \
    "files/faridalms-files/t/"; do
    grep -q "<Key>$key" "$work/listing.xml" || { echo "missing $key"; return 1; }
  done
}
check "unconfigured, the job does nothing and says so" unconfigured_backup
check "configured, a run uploads the dumps and the buckets" first_backup
check "a second run copies only what changed" second_backup
check "neither run asked to delete anything" no_deletes
check "the bucket holds the day's dumps and the files" bucket_holds

echo "== Restore, as restore.md does it"
restore() {
  local database
  backup --user root -v "${project}_restore:/restore" backup fetch "$day" /restore &&
    compose stop api web collab media provisioner ops backup &&
    psql_cell -d postgres -c "alter database cell rename to cell_before_restore" \
      -c "alter database directory rename to directory_before_restore" &&
    compose run --rm -T migrate bun migrate.js provision || return 1
  for database in cell directory; do
    compose run --rm -T -v "${project}_restore:/restore" -e PGUSER=postgres -e PGPASSWORD="$POSTGRES_PASSWORD" \
      --entrypoint pg_restore backup --create --exit-on-error --dbname=postgres "/restore/$database.dump" ||
      return 1
  done
  compose up -d --wait --wait-timeout 300
}
count_rows() {
  psql_cell -d "$1" -c "select string_agg(format('select %L, count(*) from %I.%I', n.nspname || '.' || c.relname, n.nspname, c.relname), ' union all ')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and c.relpersistence = 'p' and not c.relispartition
      and n.nspname not in ('pg_catalog', 'information_schema')" |
    psql_cell -d "$1" | sort
}
same_rows() {
  count_rows "$1_before_restore" >"$work/$1-before.txt" && count_rows "$1" >"$work/$1-after.txt" &&
    wc -l <"$work/$1-after.txt" && diff "$work/$1-before.txt" "$work/$1-after.txt"
}
restored_sign_in() {
  curl -sk --resolve "api.$portal:$port:127.0.0.1" -H 'content-type: application/json' -H 'x-farida-school: northwind' \
    --data '{"loginName":"principal.northwind@northwind.example.com","password":"farida-development-password"}' \
    "https://api.$portal:$port/v1/identity/signIn" | grep -q '"token"'
}
restored_file() {
  local again
  again=$(api -o /dev/null -w '%{redirect_url}' "https://api.$portal:$port/v1/files/$file/content")
  [[ $(curl -sk --resolve "files.$sites:$port:127.0.0.1" "${again/files.$sites/files.$sites:$port}") == "$body" ]]
}
# The file store lost, then copied back from the backup bucket.
restore_files() {
  local key
  key=$(s3 'http://storage:8333/faridalms-files?list-type=2' | sed -n 's/.*<Key>\(t\/[^<]*\)<\/Key>.*/\1/p' | head -1)
  [[ -n "$key" ]] && s3 -X DELETE "http://storage:8333/faridalms-files/$key" &&
    ! s3 -o /dev/null "http://storage:8333/faridalms-files/$key" &&
    backup backup rclone copy backup:backups/files/faridalms-files files:faridalms-files &&
    s3 -o /dev/null "http://storage:8333/faridalms-files/$key"
}
check "the dumps are fetched, checked and restored, and the stack comes back" restore
check "a lost file is copied back from the backup bucket" restore_files
check "the restored cell holds what the old one did" same_rows cell
check "the restored directory holds what the old one did" same_rows directory
check "the principal signs in on the restored cell" restored_sign_in
check "a session and a file from before the restore still open" restored_file

echo "== Memory in use"
mapfile -t running < <(docker ps --filter "label=com.docker.compose.project=$project" -q)
docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' "${running[@]}"

if ((failures > 0)); then
  echo "$failures check(s) failed"
  exit 1
fi
echo "Every check passed."
