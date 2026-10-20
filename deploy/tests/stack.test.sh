#!/usr/bin/env bash
# End-to-end test of the production stack on one machine: boot it, prove it is healthy, then
# prove that a backup can be restored (database row, media file) and that rotation, the
# checksum guard and the off-site copy behave.
#
#   OPENRESTO_REGISTRY=local OPENRESTO_VERSION=test deploy/tests/stack.test.sh
#
# Needs the three images to exist locally (build them with docker-compose.build.yml or the CI
# job), Docker Compose, curl, and ports 80/443 free. rclone is optional: without it the
# off-site step is reported as skipped, never as passed.
# pass() cannot fail, so "A && pass || fail" below is a real if/else.
# shellcheck disable=SC2015
set -Eeuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-openresto-test}"
export ENV_FILE="$work/.env"
export COMPOSE_FILE="$here/docker-compose.prod.yml"
passed=0; failed=0

pass() { passed=$((passed + 1)); printf 'PASS  %s\n' "$*"; }
fail() { failed=$((failed + 1)); printf 'FAIL  %s\n' "$*" >&2; }
expect() { # label expected actual
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1: expected '$2', got '$3'"; fi
}

# shellcheck source=../backup/lib.sh
. "$here/backup/lib.sh"

teardown() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  # The data directories are owned by the container's user.
  docker run --rm -v "$work:/w" alpine:3 rm -rf /w/data /w/backups /w/remote >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap teardown EXIT

mkdir -p "$work/backups"
cat > "$ENV_FILE" <<ENV
DOMAIN=localhost
ACME_EMAIL=ops@example.test
OPENRESTO_REGISTRY=${OPENRESTO_REGISTRY:-local}
OPENRESTO_VERSION=${OPENRESTO_VERSION:-test}
DATA_DIR=$work/data
JWT_KEY=$(head -c 48 /dev/urandom | base64 | tr -d '\n')
ADMIN_EMAIL=owner@example.test
ADMIN_PASSWORD=Test-passw0rd-$(head -c 6 /dev/urandom | od -An -tx1 | tr -d ' \n')
SMTP_HOST=smtp.example.test
SMTP_PORT=465
SMTP_USERNAME=mailer
SMTP_PASSWORD=smtp-secret-do-not-leak
SMTP_FROM_EMAIL=noreply@example.test
SMTP_FROM_NAME=Test Resto
BACKUP_DIR=$work/backups
BACKUP_KEEP_DAILY=2
BACKUP_KEEP_WEEKLY=4
ENV
export SMOKE_INSECURE=1
base="https://localhost"
jar="$work/cookies"
api() { curl -sS -k -m 15 -b "$jar" -c "$jar" -H 'Content-Type: application/json' "$@"; }

echo "== 1. boot"
# --pull never below keeps the OpenResto images local, but Caddy comes from a registry: fetch
# whatever the stack needs that is not an OpenResto image and not already here.
for image in $(compose config --images | grep -v '/openresto-'); do
  docker image inspect "$image" >/dev/null 2>&1 || docker pull -q "$image"
done
compose up -d --pull never --wait --wait-timeout 180
"$here/smoke.sh"

echo "== 2. the visitor's address reaches the backend, not Caddy's"
# nginx behind Caddy: its access log shows the address it treats as the client.
curl -sS -k -m 10 -o /dev/null "$base/api/health"
caddy_ip="$(docker inspect --format '{{range $k,$v := .NetworkSettings.Networks}}{{if eq $k "'"$COMPOSE_PROJECT_NAME"'_edge"}}{{$v.IPAddress}}{{end}}{{end}}' "$(compose ps -q caddy)")"
last_line="$(compose logs --no-log-prefix reverse-proxy | grep 'GET /api/health' | tail -n 1)"
client_ip="${last_line%% *}"
if [ -n "$caddy_ip" ] && [ "$client_ip" != "$caddy_ip" ]; then pass "nginx sees $client_ip as the client (Caddy is $caddy_ip)"; else fail "nginx saw Caddy ($caddy_ip) as the client: '$last_line'"; fi

echo "== 3. admin login, SMTP seeded from the environment"
api -o /dev/null -w '' -X POST "$base/api/admin/auth/login" \
  -d "{\"email\":\"$(env_get ADMIN_EMAIL)\",\"password\":\"$(env_get ADMIN_PASSWORD)\"}"
smtp="$(api "$base/api/admin/email-settings")"
expect "email settings host comes from SMTP_HOST" smtp.example.test "$(printf '%s' "$smtp" | python3 -c 'import json,sys; print(json.load(sys.stdin)["host"])')"
expect "email settings port comes from SMTP_PORT" 465 "$(printf '%s' "$smtp" | python3 -c 'import json,sys; print(json.load(sys.stdin)["port"])')"
case "$smtp" in *smtp-secret-do-not-leak*) fail "the SMTP password is returned by the API" ;; *) pass "the SMTP password is not returned by the API" ;; esac
case "$(compose logs backend 2>&1)" in *smtp-secret-do-not-leak*) fail "the SMTP password is in the backend log" ;; *) pass "the SMTP password is not in the backend log" ;; esac

echo "== 4. data written before the backup"
set_brand() { api -o /dev/null -w '%{http_code}' -X PATCH "$base/api/brand" -d "{\"appName\":\"$1\"}"; }
brand_name() { api "$base/api/brand" | python3 -c 'import json,sys; print(json.load(sys.stdin)["appName"])'; }
expect "brand rename accepted" 200 "$(set_brand Marker-Before)"
compose exec -T backend sh -c 'echo before > /app/wwwroot/media/marker.txt && chown app:app /app/wwwroot/media/marker.txt'
expect "media is served through nginx" before "$(curl -sS -k "$base/media/marker.txt")"

echo "== 5. backup"
"$here/backup/backup.sh"
newest="$(find "$work/backups/daily" -name '*.tar.gz' | sort | tail -n 1)"
[ -n "$newest" ] && pass "daily archive written: $(basename "$newest")" || fail "no daily archive"
( cd "$(dirname "$newest")" && sha256sum -c "$(basename "$newest").sha256" >/dev/null ) && pass "checksum file verifies" || fail "checksum file does not verify"
listing="$(tar -tzf "$newest")"
grep -q '^./openresto.db$' <<< "$listing" && pass "archive holds the database" || fail "archive lacks the database"
grep -q '^./media/marker.txt$' <<< "$listing" && pass "archive holds the media" || fail "archive lacks the media"
grep -q '^./dp-keys/' <<< "$listing" && pass "archive holds the Data Protection keys" || fail "archive lacks the Data Protection keys"
manifest="$(tar -xzOf "$newest" ./MANIFEST)"
grep -q '^last_migration=.' <<< "$manifest" && pass "manifest records the schema version" || fail "manifest has no schema version"
[ "$(find "$work/backups/weekly" -name '*.tar.gz' | wc -l)" -eq 1 ] && pass "first backup of the week kept as the weekly one" || fail "weekly copy missing"

echo "== 6. rotation"
sleep 1; "$here/backup/backup.sh" >/dev/null
sleep 1; "$here/backup/backup.sh" >/dev/null
expect "daily keeps the newest 2 of 3" 2 "$(find "$work/backups/daily" -name '*.tar.gz' | wc -l)"
expect "a rotated archive takes its checksum with it" 2 "$(find "$work/backups/daily" -name '*.sha256' | wc -l)"
for w in 2026-W01 2026-W02 2026-W03 2026-W04 2026-W05; do touch "$work/backups/weekly/openresto-$w.tar.gz"; done
"$here/backup/backup.sh" >/dev/null
expect "weekly keeps the newest 4" 4 "$(find "$work/backups/weekly" -name '*.tar.gz' | wc -l)"
[ -z "$(find "$work/backups/weekly" -name 'openresto-2026-W01.tar.gz')" ] && pass "the oldest weekly was rotated out" || fail "the oldest weekly was not rotated out"

echo "== 7. off-site copy"
if command -v rclone >/dev/null 2>&1; then
  mkdir -p "$work/remote"
  BACKUP_REMOTE="$work/remote" "$here/backup/backup.sh" >/dev/null
  [ "$(find "$work/remote" -name '*.tar.gz' | wc -l)" -ge 1 ] && pass "archives reached the remote" || fail "nothing reached the remote"
  [ -z "$(find "$work/remote" -name '.lock' -o -name '.work*')" ] && pass "no scratch files on the remote" || fail "scratch files leaked to the remote"
else
  echo "SKIP  rclone is not installed; a real off-site copy was not exercised"
fi
# A remote that refuses must not cost the local backup, and must be visible to systemd (exit 3).
mkdir -p "$work/bin"
printf '#!/bin/sh\nexit 1\n' > "$work/bin/rclone"; chmod +x "$work/bin/rclone"
before="$(find "$work/backups/daily" -name '*.tar.gz' | wc -l)"
sleep 1
set +e
PATH="$work/bin:$PATH" BACKUP_REMOTE="somewhere:bucket" "$here/backup/backup.sh" >/dev/null 2>&1
code=$?
set -e
expect "a failing off-site copy exits 3" 3 "$code"
newest_after="$(find "$work/backups/daily" -name '*.tar.gz' | sort | tail -n 1)"
[ -s "$newest_after" ] && pass "the local backup is intact when the off-site copy fails" || fail "no local backup after an off-site failure"
[ "$before" -ge 1 ] || fail "no daily archives before the failing run"

echo "== 8. restore"
latest="$(find "$work/backups/daily" -name '*.tar.gz' | sort | tail -n 1)"
expect "change after the backup accepted" 200 "$(set_brand Marker-After)"
compose exec -T backend rm /app/wwwroot/media/marker.txt
expect "media marker is gone before the restore" 404 "$(curl -sS -k -o /dev/null -w '%{http_code}' "$base/media/marker.txt")"

echo "-- a damaged archive is refused and nothing is touched"
cp "$latest" "$work/damaged.tar.gz"; cp "$latest.sha256" "$work/damaged.tar.gz.sha256"
printf 'x' >> "$work/damaged.tar.gz"
if "$here/backup/restore.sh" --yes "$work/damaged.tar.gz" >/dev/null 2>&1; then fail "a damaged archive was restored"; else pass "a damaged archive is refused"; fi
expect "live data untouched by the refused restore" Marker-After "$(brand_name)"

echo "-- the real restore"
"$here/backup/restore.sh" --yes "$latest"
api -o /dev/null -X POST "$base/api/admin/auth/login" \
  -d "{\"email\":\"$(env_get ADMIN_EMAIL)\",\"password\":\"$(env_get ADMIN_PASSWORD)\"}"
expect "database row is back" Marker-Before "$(brand_name)"
expect "media file is back" before "$(curl -sS -k "$base/media/marker.txt")"
expect "email settings are back" smtp.example.test "$(api "$base/api/admin/email-settings" | python3 -c 'import json,sys; print(json.load(sys.stdin)["host"])')"
[ "$(find "$work/backups/pre-restore" -name '*.tar.gz' | wc -l)" -eq 1 ] && pass "the replaced state was kept in pre-restore/" || fail "no pre-restore copy"
"$here/smoke.sh" >/dev/null && pass "stack still healthy after the restore" || fail "stack unhealthy after the restore"

echo
echo "passed: $passed  failed: $failed"
[ "$failed" -eq 0 ]
