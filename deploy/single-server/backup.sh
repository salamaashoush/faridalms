#!/usr/bin/env bash
# Backs up one cell to a bucket at another provider:
#
#   db/<date>/roles.sql       the cluster's roles, without passwords
#   db/<date>/<cell>.dump     pg_dump -Fc of the cell
#   db/<date>/<directory>.dump
#   db/<date>/<business>.dump the operator console's business database
#   db/<date>/SHA256SUMS
#   files/<bucket>/...        a copy of each file bucket, added to nightly
#
# The backup keys may write and list but not delete, and the bucket keeps
# every version under object lock, so nothing here ever deletes: the bucket
# copy only adds what is new or changed, and a second run on one day writes
# a new version of that day's dumps.
#
#   farida-backup schedule      run every day at BACKUP_AT (UTC, default 02:30)
#   farida-backup run           run once now
#   farida-backup fetch <date> <dir>
#                               download one day's dumps and check them
#   farida-backup rclone <args> rclone with two remotes, `backup:` (the backup
#                               bucket's provider) and `files:` (the file
#                               store's), for restoring files (restore.md)
set -euo pipefail

STATUS=/tmp/farida-backup.status
WORK=

log() { printf '%s backup: %s\n' "$(date -u +%FT%TZ)" "$*"; }

configured() {
  local name missing=()
  for name in BACKUP_S3_ENDPOINT BACKUP_S3_REGION BACKUP_S3_BUCKET \
    BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY; do
    [[ -n "${!name:-}" ]] || missing+=("$name")
  done
  if ((${#missing[@]} > 0)); then
    log "not configured, nothing backed up (unset: ${missing[*]})"
    echo unconfigured >"$STATUS"
    return 1
  fi
}

# rclone reads remotes from RCLONE_CONFIG_<NAME>_<OPTION>. Neither remote
# checks or creates its bucket, which the keys may not be allowed to do.
remotes() {
  export RCLONE_CONFIG_BACKUP_TYPE=s3
  export RCLONE_CONFIG_BACKUP_PROVIDER=Other
  export RCLONE_CONFIG_BACKUP_ENDPOINT="$BACKUP_S3_ENDPOINT"
  export RCLONE_CONFIG_BACKUP_REGION="$BACKUP_S3_REGION"
  export RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID"
  export RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_BACKUP_FORCE_PATH_STYLE=true
  export RCLONE_CONFIG_BACKUP_NO_CHECK_BUCKET=true
  # Aborting a failed multipart upload is a delete the keys may not hold;
  # the bucket's lifecycle rule clears unfinished uploads instead.
  export RCLONE_CONFIG_BACKUP_LEAVE_PARTS_ON_ERROR=true

  export RCLONE_CONFIG_FILES_TYPE=s3
  export RCLONE_CONFIG_FILES_PROVIDER=Other
  export RCLONE_CONFIG_FILES_ENDPOINT="${S3_ENDPOINT:-}"
  export RCLONE_CONFIG_FILES_REGION="${S3_REGION:-}"
  export RCLONE_CONFIG_FILES_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-}"
  export RCLONE_CONFIG_FILES_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-}"
  if [[ "${S3_ADDRESSING_STYLE:-path}" == virtual ]]; then
    export RCLONE_CONFIG_FILES_FORCE_PATH_STYLE=false
  else
    export RCLONE_CONFIG_FILES_FORCE_PATH_STYLE=true
  fi
  export RCLONE_CONFIG_FILES_NO_CHECK_BUCKET=true
}

# Runs as a process of its own (see schedule), so that set -e holds in it:
# bash ignores -e inside a function called as the condition of an if or ||.
run() {
  configured || return 0
  remotes
  echo running >"$STATUS"
  local day cell directory business bucket database
  day=$(date -u +%F)
  cell="${CELL_DATABASE:-cell}"
  directory="${DIRECTORY_DATABASE:-directory}"
  business="${BUSINESS_DATABASE:-business}"
  WORK=$(mktemp -d)
  trap finished EXIT
  local work="$WORK"

  log "dumping roles, $cell, $directory and $business"
  pg_dumpall --roles-only --no-role-passwords --database=postgres >"$work/roles.sql"
  for database in "$cell" "$directory" "$business"; do
    pg_dump --format=custom --no-unlogged-table-data --exclude-schema=staging \
      --dbname="$database" --file="$work/$database.dump"
    # A dump that pg_restore cannot list would not restore either.
    pg_restore --list "$work/$database.dump" >/dev/null
  done
  (cd "$work" && sha256sum roles.sql "$cell.dump" "$directory.dump" "$business.dump" >SHA256SUMS)

  log "uploading db/$day/"
  rclone copy "$work" "backup:$BACKUP_S3_BUCKET/db/$day" --stats-one-line --stats=0 -v

  for bucket in ${FILE_BUCKET:-} ${PUBLIC_MEDIA_BUCKET:-}; do
    log "copying new and changed objects of $bucket"
    # --checksum compares sizes and MD5s from the listings, where the default
    # would ask each object for its modification time, one request apiece.
    rclone copy "files:$bucket" "backup:$BACKUP_S3_BUCKET/files/$bucket" \
      --checksum --fast-list --stats-one-line --stats=0 -v
  done

  echo "ok $(date -u +%FT%TZ) db/$day" >"$STATUS"
  log "done: db/$day"
}

# Whatever stopped a run, it is recorded as failed unless it finished.
finished() {
  local code=$?
  rm -rf "$WORK"
  if ((code != 0)); then
    echo "failed $(date -u +%FT%TZ)" >"$STATUS"
    log "failed with exit code $code"
  fi
}

fetch() {
  local day="${1:?fetch needs a date such as 2026-11-01}" into="${2:?fetch needs a folder}"
  configured || exit 1
  remotes
  mkdir -p "$into"
  rclone copy "backup:$BACKUP_S3_BUCKET/db/$day" "$into" -v
  (cd "$into" && sha256sum --check SHA256SUMS)
}

schedule() {
  local at="${BACKUP_AT:-02:30}" now next
  trap 'log "stopping"; exit 0' TERM INT
  log "daily at $at UTC"
  configured || true
  while true; do
    now=$(date -u +%s)
    next=$(date -u -d "today $at" +%s)
    ((next > now)) || next=$(date -u -d "tomorrow $at" +%s)
    log "next run $(date -u -d "@$next" +%FT%TZ)"
    sleep $((next - now)) &
    wait $!
    "$0" run || log "the next attempt is tomorrow"
  done
}

# Healthy unless the last run failed.
health() {
  [[ ! -f "$STATUS" ]] || ! grep -q '^failed' "$STATUS"
}

case "${1:-schedule}" in
  schedule) schedule ;;
  run) run ;;
  fetch) fetch "${2:-}" "${3:-}" ;;
  health) health ;;
  rclone)
    configured || exit 1
    remotes
    shift
    exec rclone "$@"
    ;;
  *)
    echo "usage: farida-backup schedule|run|fetch <date> <dir>|rclone <args>|health" >&2
    exit 64
    ;;
esac
