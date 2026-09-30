#!/bin/sh
# Proves a backup made by scripts/backup-db.sh can actually be restored: downloads the newest one
# (or the one named), decrypts it with the age private key, loads it into a throwaway Postgres
# container and prints what came back. A backup nobody has ever restored is only a hope — run this
# regularly, on a machine that holds the private key (never the server itself).
#
#   scripts/verify-backup.sh ~/keys/cantero-backup.key [cantero-<db>-<timestamp>.sql.gz.age]
#
# Reads the bucket and credentials the same way backup-db.sh does (.env, .env.prod, BACKUP_S3_*
# falling back to S3_*). Needs docker, age and the AWS CLI. Prints one "<table> <rows>" line per
# key table, so the output can be compared with the live database's counts.

set -eu
umask 077

KEY="${1:?usage: $0 <age private key file> [backup file name]}"
WANTED="${2:-}"
[ -r "$KEY" ] || { echo "Can't read the private key at $KEY" >&2; exit 1; }
KEY="$(cd "$(dirname "$KEY")" && pwd)/$(basename "$KEY")"

cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
[ -f .env.prod ] && set -a && . ./.env.prod && set +a
: "${POSTGRES_USER:?POSTGRES_USER not set — check .env}"
: "${POSTGRES_DB:?POSTGRES_DB not set — check .env}"
command -v age >/dev/null 2>&1 || { echo "age is not installed" >&2; exit 1; }

BUCKET="${BACKUP_S3_BUCKET:-${S3_BUCKET:-}}"
: "${BUCKET:?Neither BACKUP_S3_BUCKET nor S3_BUCKET is set — check .env.prod}"
ENDPOINT="${BACKUP_S3_ENDPOINT:-${S3_ENDPOINT:-}}"
REGION="${BACKUP_S3_REGION:-${S3_REGION:-}}"
# The AWS CLI's default integrity checksums aren't accepted by every S3-compatible store, so only
# send them when an operation requires one (same as the API's StorageService).
s3() {
  AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID:-${S3_ACCESS_KEY_ID:-}}" \
    AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY:-${S3_SECRET_ACCESS_KEY:-}}" \
    aws s3 "$@" ${ENDPOINT:+--endpoint-url "$ENDPOINT"} ${REGION:+--region "$REGION"}
}

if [ -z "$WANTED" ]; then
  # Names carry a sortable timestamp (cantero-<db>-YYYY-MM-DD_HHMMSS), so the last one is newest.
  WANTED=$(s3 ls "s3://${BUCKET}/backups/" | awk '{print $4}' | grep '^cantero-' | sort | tail -n 1)
  [ -n "$WANTED" ] || { echo "No backups found in s3://${BUCKET}/backups/" >&2; exit 1; }
fi

WORK=$(mktemp -d)
CONTAINER="cantero-verify-backup-$$"
trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

echo "Checking ${WANTED}..." >&2
s3 cp "s3://${BUCKET}/backups/${WANTED}" "$WORK/backup.age" >/dev/null
age -d -i "$KEY" -o "$WORK/backup.sql.gz" "$WORK/backup.age"
gunzip "$WORK/backup.sql.gz"

# Same major version as docker-compose.prod.yml's postgres service.
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=verify-only postgres:16-alpine >/dev/null
# Over TCP: while the image initialises a fresh data directory it runs a temporary server on the
# Unix socket only, then restarts — a socket check would pass during that first, short-lived one.
i=0
until docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -lt 60 ] || { echo "The throwaway Postgres didn't start" >&2; exit 1; }
  sleep 1
done
# The dump assigns ownership to the production role, so that role has to exist first.
docker exec "$CONTAINER" psql -q -U postgres -c "CREATE ROLE \"$POSTGRES_USER\"" -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\""
docker exec -i "$CONTAINER" psql -q -v ON_ERROR_STOP=1 -U postgres -d "$POSTGRES_DB" < "$WORK/backup.sql" >/dev/null

q() { docker exec "$CONTAINER" psql -At -U postgres -d "$POSTGRES_DB" -c "$1"; }

applied=$(q "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL")
[ "$(q "SELECT count(*) FROM pg_trigger WHERE tgname = 'gobd_ledger_no_update_or_delete'")" = "1" ] \
  || { echo "The restored database lacks the GoBD ledger's append-only trigger" >&2; exit 1; }
echo "Restored: ${applied} migrations applied, GoBD ledger trigger present." >&2

for table in companies users projects invoices payments vendor_bills documents gobd_ledger_entries gobd_ledger_anchors; do
  echo "$table $(q "SELECT count(*) FROM \"$table\"")"
done
