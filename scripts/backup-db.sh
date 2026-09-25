#!/bin/sh
# Daily Postgres backup: pg_dump the running `postgres` container, gzip it, encrypt it to a public
# key with age, and push it to an S3-compatible bucket (under a `backups/` prefix). Run this on the
# VPS's own crontab — NOT inside a container — so it keeps working across `docker compose down`
# and survives the app containers being recreated.
#
# Encrypted to a public key, not with a password stored here: the VPS can write a backup but not
# read one back, so neither a compromised server nor a leaked bucket exposes the database (clients,
# invoices, payroll). Nothing is uploaded unencrypted — the script refuses to run without
# BACKUP_AGE_RECIPIENT. Keep the matching private key OFF this server (password manager, offline).
#
# Prerequisites on the VPS:
#   - The AWS CLI (`apt install awscli` or the official installer) — works against any
#     S3-compatible endpoint (Cloudflare R2, DigitalOcean Spaces, ...) via --endpoint-url.
#   - age (`apt install age`). Once, on your own machine: `age-keygen -o cantero-backup.key` — put
#     the "public key: age1..." line it prints into BACKUP_AGE_RECIPIENT in .env.prod.
#   - docker-compose.prod.yml's `postgres` service already running.
#
# Where backups go: BACKUP_S3_BUCKET, with its own BACKUP_S3_ACCESS_KEY_ID/BACKUP_S3_SECRET_ACCESS_KEY
# (and optionally BACKUP_S3_ENDPOINT/BACKUP_S3_REGION) — ideally a separate bucket with object
# lock/versioning, whose credentials the API never has, so whatever can delete uploads can't also
# delete the backups. Each BACKUP_S3_* setting falls back to the uploads' S3_* one when unset.
#
# Restore (on a machine holding the private key):
#   age -d -i cantero-backup.key cantero-<db>-<timestamp>.sql.gz.age | gunzip | psql -U <user> <db>
#
# Install as a daily cron job (as the user that can run `docker compose`):
#   crontab -e
#   0 3 * * * /path/to/cantero/scripts/backup-db.sh >> /var/log/cantero-backup.log 2>&1
#
# Retention: keeps the last 14 daily backups in S3 (older ones are deleted below). Longer-term
# retention is intentionally left to an S3/R2/Spaces lifecycle rule on the bucket rather than
# reimplemented here — a bucket lifecycle policy is simpler and more reliable than "keep the first
# of each month" logic in shell, and every provider this app supports has one.

set -eu
# The dump sits unencrypted in /tmp for a moment — readable by this user only.
umask 077

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# .env holds POSTGRES_USER/POSTGRES_DB (compose-substitution vars); .env.prod holds the S3
# credentials (api container runtime secrets). Both live at the repo root — see
# docker-compose.prod.yml's own top comment for why they're kept separate.
[ -f .env ] && set -a && . ./.env && set +a
[ -f .env.prod ] && set -a && . ./.env.prod && set +a

: "${POSTGRES_USER:?POSTGRES_USER not set — check .env}"
: "${POSTGRES_DB:?POSTGRES_DB not set — check .env}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT not set — refusing to upload an unencrypted backup (see this script's header)}"
command -v age >/dev/null 2>&1 || { echo "age is not installed (apt install age)" >&2; exit 1; }

BUCKET="${BACKUP_S3_BUCKET:-${S3_BUCKET:-}}"
: "${BUCKET:?Neither BACKUP_S3_BUCKET nor S3_BUCKET is set — check .env.prod}"
if [ "$BUCKET" = "${S3_BUCKET:-}" ]; then
  echo "[$(date -Iseconds)] WARNING: backups share the uploads bucket ($BUCKET) — set BACKUP_S3_BUCKET and its own credentials to keep them apart." >&2
fi

RETENTION_COUNT=14
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
FILENAME="cantero-${POSTGRES_DB}-${TIMESTAMP}.sql.gz.age"
# Dump to an uncompressed temp file first, then gzip and encrypt it as separate steps, rather than
# piping pg_dump straight into gzip: under /bin/sh (dash on Debian, what this script actually runs
# under), `set -e` does NOT abort on a failing command in the middle of a pipeline — only the
# pipeline's last stage (gzip, which happily "succeeds" compressing empty/partial input) decides
# the exit status. A pg_dump failure (auth error, container not up, wrong DB name) would otherwise
# go unnoticed and a broken or empty backup would still get uploaded to S3 as if nothing were wrong.
TMP_SQL="/tmp/cantero-${POSTGRES_DB}-${TIMESTAMP}.sql"
TMP_GZ="${TMP_SQL}.gz"
TMP_AGE="${TMP_GZ}.age"
trap 'rm -f "$TMP_SQL" "$TMP_GZ" "$TMP_AGE"' EXIT

ENDPOINT="${BACKUP_S3_ENDPOINT:-${S3_ENDPOINT:-}}"
REGION="${BACKUP_S3_REGION:-${S3_REGION:-}}"
s3() {
  AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID:-${S3_ACCESS_KEY_ID:-}}" \
    AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY:-${S3_SECRET_ACCESS_KEY:-}}" \
    aws s3 "$@" ${ENDPOINT:+--endpoint-url "$ENDPOINT"} ${REGION:+--region "$REGION"}
}

echo "[$(date -Iseconds)] Dumping ${POSTGRES_DB}..."
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$TMP_SQL"

echo "[$(date -Iseconds)] Compressing..."
gzip "$TMP_SQL"

echo "[$(date -Iseconds)] Encrypting..."
age -r "$BACKUP_AGE_RECIPIENT" -o "$TMP_AGE" "$TMP_GZ"
rm -f "$TMP_GZ"

echo "[$(date -Iseconds)] Uploading to s3://${BUCKET}/backups/${FILENAME}..."
s3 cp "$TMP_AGE" "s3://${BUCKET}/backups/${FILENAME}"

echo "[$(date -Iseconds)] Pruning backups beyond the last ${RETENTION_COUNT}..."
s3 ls "s3://${BUCKET}/backups/" | awk '{print $4}' | grep '^cantero-' | sort | head -n "-${RETENTION_COUNT}" | while read -r old; do
  [ -n "$old" ] && s3 rm "s3://${BUCKET}/backups/${old}"
done

echo "[$(date -Iseconds)] Backup complete: ${FILENAME}"
