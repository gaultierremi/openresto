#!/usr/bin/env bash
# Proves the stack is up end to end: every container healthy, then the public address answering
# through Caddy and nginx. Used after an install or an upgrade, by the CI job and by hand.
#
#   ./smoke.sh                  checks https://$DOMAIN
#   SMOKE_INSECURE=1 ./smoke.sh trusts a self-signed certificate (a local DOMAIN=localhost run)
set -Eeuo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=backup/lib.sh
. "$here/backup/lib.sh"

domain="$(env_get DOMAIN)"
[ -n "$domain" ] || die "DOMAIN is not set"
curl_opts=(-sS -m 10 -o /dev/null)
[ "${SMOKE_INSECURE:-0}" = 1 ] && curl_opts+=(-k)
base="https://$domain${SMOKE_PORT:+:$SMOKE_PORT}"
fail=0

for _ in $(seq 1 60); do
  unhealthy="$(compose ps --format '{{.Service}}={{.Health}}' | grep -v '=healthy$' || true)"
  [ -z "$unhealthy" ] && break
  sleep 2
done
echo "== container health"
compose ps --format 'table {{.Service}}\t{{.Status}}'
if [ -n "$unhealthy" ]; then echo "NOT healthy: $unhealthy" >&2; fail=1; fi

check() { # label path expected-status
  local code
  code="$(curl "${curl_opts[@]}" -w '%{http_code}' "$base$2" || true)"
  printf '%-34s %s (want %s)\n' "$1" "$code" "$3"
  [ "$code" = "$3" ] || fail=1
}
echo "== $base"
check "GET /api/health (backend)" /api/health 200
check "GET / (web app)" / 200
check "GET /api/brand" /api/brand 200
check "GET /openapi/v1.json (must be closed)" /openapi/v1.json 404
if [ "${SMOKE_INSECURE:-0}" != 1 ]; then
  code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "http://$domain/" || true)"
  printf '%-34s %s (want 308)\n' "GET http://$domain/ (redirect)" "$code"
  [ "$code" = 308 ] || fail=1
fi

if [ "$fail" -ne 0 ]; then echo "SMOKE FAILED" >&2; exit 1; fi
echo "SMOKE OK"
