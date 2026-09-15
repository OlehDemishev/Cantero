#!/bin/sh
# Daily Postgres backup: pg_dump the running `postgres` container, gzip it, and push it to the
# same S3-compatible bucket already used for uploads (under a `backups/` prefix). Run this on the
# VPS's own crontab — NOT inside a container — so it keeps working across `docker compose down`
# and survives the app containers being recreated.
#
# Prerequisites on the VPS:
#   - The AWS CLI (`apt install awscli` or the official installer) — works against any
#     S3-compatible endpoint (Cloudflare R2, DigitalOcean Spaces, ...) via --endpoint-url.
#   - docker-compose.prod.yml's `postgres` service already running.
#
# Install as a daily cron job (as the user that can run `docker compose`):
#   crontab -e
#   0 3 * * * /path/to/bau_geld/scripts/backup-db.sh >> /var/log/cantero-backup.log 2>&1
#
# Retention: keeps the last 14 daily backups in S3 (older ones are deleted below). Longer-term
# retention is intentionally left to an S3/R2/Spaces lifecycle rule on the bucket rather than
# reimplemented here — a bucket lifecycle policy is simpler and more reliable than "keep the first
# of each month" logic in shell, and every provider this app supports has one.

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# .env holds POSTGRES_USER/POSTGRES_DB (compose-substitution vars); .env.prod holds the S3
# credentials (api container runtime secrets). Both live at the repo root — see
# docker-compose.prod.yml's own top comment for why they're kept separate.
[ -f .env ] && set -a && . ./.env && set +a
[ -f .env.prod ] && set -a && . ./.env.prod && set +a

: "${POSTGRES_USER:?POSTGRES_USER not set — check .env}"
: "${POSTGRES_DB:?POSTGRES_DB not set — check .env}"
: "${S3_BUCKET:?S3_BUCKET not set — check .env.prod}"

RETENTION_COUNT=14
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
FILENAME="cantero-${POSTGRES_DB}-${TIMESTAMP}.sql.gz"
# Dump to an uncompressed temp file first, then gzip it as a separate step, rather than piping
# pg_dump straight into gzip: under /bin/sh (dash on Debian, what this script actually runs
# under), `set -e` does NOT abort on a failing command in the middle of a pipeline — only the
# pipeline's last stage (gzip, which happily "succeeds" compressing empty/partial input) decides
# the exit status. A pg_dump failure (auth error, container not up, wrong DB name) would otherwise
# go unnoticed and a broken or empty backup would still get uploaded to S3 as if nothing were wrong.
TMP_SQL="/tmp/cantero-${POSTGRES_DB}-${TIMESTAMP}.sql"
TMP_GZ="${TMP_SQL}.gz"

s3() {
  AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-}" AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-}" \
    aws s3 "$@" ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"} ${S3_REGION:+--region "$S3_REGION"}
}

echo "[$(date -Iseconds)] Dumping ${POSTGRES_DB}..."
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$TMP_SQL"

echo "[$(date -Iseconds)] Compressing..."
gzip "$TMP_SQL"

echo "[$(date -Iseconds)] Uploading to s3://${S3_BUCKET}/backups/${FILENAME}..."
s3 cp "$TMP_GZ" "s3://${S3_BUCKET}/backups/${FILENAME}"
rm -f "$TMP_GZ"

echo "[$(date -Iseconds)] Pruning backups beyond the last ${RETENTION_COUNT}..."
s3 ls "s3://${S3_BUCKET}/backups/" | awk '{print $4}' | grep '^cantero-' | sort | head -n "-${RETENTION_COUNT}" | while read -r old; do
  [ -n "$old" ] && s3 rm "s3://${S3_BUCKET}/backups/${old}"
done

echo "[$(date -Iseconds)] Backup complete: ${FILENAME}"
