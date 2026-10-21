#!/usr/bin/env bash
# Health check of a running instance, for the operator by hand or for a cron job or monitor.
# One line per check; the exit code is the verdict.
#
#   ./health.sh
#
# Exit codes: 0 everything is fine, 1 warnings only, 2 at least one failure.
#
# It runs smoke.sh (containers healthy, the public address answering) and adds what smoke.sh
# does not look at: the certificate's remaining life, free disk, the age and checksum of the
# newest backup, and the settings that make an unattended instance safe.
set -Eeuo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=backup/lib.sh
. "$here/backup/lib.sh"

smoke="${HEALTH_SMOKE:-$here/smoke.sh}"

# Caddy renews a certificate with 30 days left, so under 14 means the renewal is failing.
readonly CERT_WARN_DAYS=14
readonly CERT_FAIL_DAYS=3
readonly DISK_WARN_FREE_PERCENT=20
readonly DISK_FAIL_FREE_PERCENT=8
# A daily backup is at most a day old; a missed night is a warning, a missed weekend is not.
readonly BACKUP_WARN_HOURS=36
readonly BACKUP_FAIL_HOURS=72
# A TLS handshake with a host that accepts the connection and never answers would hang forever.
readonly CERT_PROBE_TIMEOUT_SECONDS="${HEALTH_CERT_TIMEOUT:-10}"

warnings=0
failures=0
pass() { printf 'OK    %s\n' "$*"; }
warn() { warnings=$((warnings + 1)); printf 'WARN  %s\n' "$*"; }
fail() { failures=$((failures + 1)); printf 'FAIL  %s\n' "$*"; }

domain="$(env_get DOMAIN)"
data_dir="$(env_get DATA_DIR /srv/openresto)"
backup_dir="$(env_get BACKUP_DIR /srv/openresto-backups)"
[ -n "$domain" ] || die "DOMAIN is not set in $ENV_FILE"

check_stack() {
  local output
  if output="$("$smoke" 2>&1)"; then
    pass "containers are healthy and https://$domain answers"
  else
    fail "the stack is not healthy (smoke.sh output below)"
    printf '%s\n' "$output" | sed 's/^/        /'
  fi
}

# Days until the certificate served on HEALTH_HOST:HEALTH_PORT (default: the domain on 443)
# expires, negative once it has.
cert_days_left() {
  local host="${HEALTH_HOST:-$domain}" port="${HEALTH_PORT:-443}" end
  end="$(echo | timeout "$CERT_PROBE_TIMEOUT_SECONDS" openssl s_client -connect "$host:$port" -servername "$domain" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
  [ -n "$end" ] || return 1
  echo $(( ($(date -d "$end" +%s) - $(date +%s)) / 86400 ))
}

check_certificate() {
  local days
  if ! days="$(cert_days_left)"; then
    fail "cannot read the certificate served by $domain"
  elif [ "$days" -lt "$CERT_FAIL_DAYS" ]; then
    fail "the certificate expires in $days day(s)"
  elif [ "$days" -lt "$CERT_WARN_DAYS" ]; then
    warn "the certificate expires in $days day(s); renewal should have happened already (docker compose logs caddy)"
  else
    pass "the certificate is valid for $days more day(s)"
  fi
}

free_percent() { df -Pk "$1" | awk 'NR == 2 { gsub("%", "", $5); print 100 - $5 }'; }

check_disk() { # label directory
  local free
  if [ ! -d "$2" ]; then
    fail "$1 directory $2 does not exist"
    return
  fi
  free="$(free_percent "$2")"
  if [ "$free" -lt "$DISK_FAIL_FREE_PERCENT" ]; then
    fail "$1 ($2): ${free}% free"
  elif [ "$free" -lt "$DISK_WARN_FREE_PERCENT" ]; then
    warn "$1 ($2): ${free}% free"
  else
    pass "$1 ($2): ${free}% free"
  fi
}

# Hours since .env was written: the age of the install, for judging a missing first backup.
instance_age_hours() { echo $(( ($(date +%s) - $(stat -c %Y "$ENV_FILE")) / 3600 )); }

check_backup() {
  local newest age_hours
  newest="$(find "$backup_dir/daily" -maxdepth 1 -name 'openresto-*.tar.gz' 2>/dev/null | sort | tail -n 1 || true)"
  if [ -z "$newest" ]; then
    # A fresh install has had no night yet (or was told not to install the timer); only an
    # instance old enough to have had its first backup is failing.
    age_hours="$(instance_age_hours)"
    if [ "$age_hours" -gt "$BACKUP_WARN_HOURS" ]; then
      fail "no backup in $backup_dir/daily and the instance is ${age_hours}h old"
    else
      warn "no backup yet in $backup_dir/daily (the instance is ${age_hours}h old); take one with backup/backup.sh"
    fi
    return
  fi
  age_hours=$(( ($(date +%s) - $(stat -c %Y "$newest")) / 3600 ))
  if [ "$age_hours" -gt "$BACKUP_FAIL_HOURS" ]; then
    fail "the newest backup is ${age_hours}h old ($(basename "$newest"))"
  elif [ "$age_hours" -gt "$BACKUP_WARN_HOURS" ]; then
    warn "the newest backup is ${age_hours}h old ($(basename "$newest"))"
  else
    pass "the newest backup is ${age_hours}h old"
  fi
  if (cd "$backup_dir/daily" && sha256sum --check --status "$(basename "$newest").sha256" 2>/dev/null); then
    pass "its checksum matches"
  else
    fail "the checksum of $(basename "$newest") is missing or does not match"
  fi
  if systemctl is-active --quiet openresto-backup.timer 2>/dev/null; then
    pass "the daily backup timer is active"
  else
    warn "the openresto-backup timer is not active (ignore this if cron runs backup/backup.sh)"
  fi
}

check_settings() {
  local mode
  mode="$(stat -c %a "$ENV_FILE" 2>/dev/null || true)"
  if [ "$mode" = 600 ]; then
    pass "$ENV_FILE is private (mode 600)"
  else
    warn "$ENV_FILE has mode ${mode:-unknown}; it holds the JWT key and the admin password (chmod 600)"
  fi
  if [ "$(env_get OPENRESTO_VERSION)" = latest ]; then
    fail "OPENRESTO_VERSION is 'latest'; pin an exact release"
  fi
  if [ -e "${REBOOT_REQUIRED_FILE:-/var/run/reboot-required}" ]; then
    warn "a reboot is pending (security updates); containers restart by themselves afterwards"
  fi
}

check_stack
check_certificate
check_disk "data" "$data_dir"
check_disk "backups" "$backup_dir"
check_backup
check_settings

if [ "$failures" -gt 0 ]; then
  echo "HEALTH FAIL ($failures failure(s), $warnings warning(s))"
  exit 2
elif [ "$warnings" -gt 0 ]; then
  echo "HEALTH WARN ($warnings warning(s))"
  exit 1
fi
echo "HEALTH OK"
