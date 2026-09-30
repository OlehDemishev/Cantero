#!/bin/sh
# Writes .env and .env.prod for docker-compose.local.yml: production settings with freshly
# generated secrets, addresses on *.localhost, and SeaweedFS/Mailpit standing in for S3 and SMTP.
# Refuses to touch either file if it already exists — move yours aside first.
#
# For a real server, start from apps/api/.env.example instead: this file's placeholders (a test
# Stripe key, local addresses) are exactly what that setup must not ship with.
#
# Needs `pnpm install` to have run (web-push generates the VAPID key pair).

set -eu
cd "$(dirname "$0")/.."

for f in .env .env.prod; do
  if [ -e "$f" ]; then
    echo "$f already exists — move it aside first; this script never overwrites it." >&2
    exit 1
  fi
done

secret() { openssl rand -base64 48 | tr -d '\n'; }
PG_PASSWORD=$(openssl rand -hex 24)
S3_SECRET=$(openssl rand -hex 24)
VAPID=$(cd apps/api && node -e "const k = require('web-push').generateVAPIDKeys(); console.log(k.publicKey + ' ' + k.privateKey)")
VAPID_PUBLIC=${VAPID% *}
VAPID_PRIVATE=${VAPID#* }

umask 077

cat > .env <<EOF
# Compose substitution vars for docker-compose.local.yml — see docker-compose.prod.yml's header.
POSTGRES_USER=cantero
POSTGRES_PASSWORD=$PG_PASSWORD
POSTGRES_DB=cantero
NEXT_PUBLIC_API_URL=https://api.localhost:8443/api
S3_ACCESS_KEY_ID=cantero
S3_SECRET_ACCESS_KEY=$S3_SECRET
EOF

cat > .env.prod <<EOF
# Runtime settings for the api container of the local production stack (docker-compose.local.yml).
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://cantero:$PG_PASSWORD@postgres:5432/cantero
REDIS_URL=redis://redis:6379
WEB_ORIGIN=https://app.localhost:8443
API_ORIGIN=https://api.localhost:8443/api
JWT_SECRET=$(secret)
PORTAL_JWT_SECRET=$(secret)
SUBCONTRACTOR_PORTAL_JWT_SECRET=$(secret)
SUPPLIER_PORTAL_JWT_SECRET=$(secret)
DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)
# Stripe is never reached here; these only satisfy the startup check.
STRIPE_SECRET_KEY=sk_test_local_stack_placeholder
STRIPE_WEBHOOK_SECRET=whsec_local_stack_placeholder
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_local_stack_connect_placeholder
VAPID_PUBLIC_KEY=$VAPID_PUBLIC
VAPID_PRIVATE_KEY=$VAPID_PRIVATE
VAPID_SUBJECT=mailto:ops@cantero.localhost
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM="Cantero <noreply@cantero.localhost>"
S3_BUCKET=cantero-uploads
S3_REGION=eu-central-1
S3_ENDPOINT=http://s3:8333
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=cantero
S3_SECRET_ACCESS_KEY=$S3_SECRET
BACKUP_S3_BUCKET=cantero-backups
SEMANTIC_SEARCH_ENABLED=false
# A real, free timestamp authority: the rehearsal anchors the GoBD ledger the way production does.
GOBD_TSA_URL=http://timestamp.digicert.com
EOF

echo "Wrote .env and .env.prod for the local production stack."
