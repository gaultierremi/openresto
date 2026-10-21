#!/usr/bin/env bash
# Behaviour of health.sh: which findings are a warning (exit 1) and which a failure (exit 2),
# with each threshold pinned on both sides. The certificate check talks to a real local TLS
# server (openssl s_server) serving certificates of known remaining life; the rest is stubbed.
# Needs openssl and python3, no Docker, no root and no network.
#
#   deploy/tests/health.test.sh
# pass() cannot fail, so "A && pass || fail" below is a real if/else.
# shellcheck disable=SC2015
set -Eeuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
server_pid=""
stop_server() { [ -z "$server_pid" ] || { kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; server_pid=""; }; }
trap 'stop_server; rm -rf "$work"' EXIT
passed=0; failed=0

pass() { passed=$((passed + 1)); printf 'PASS  %s\n' "$*"; }
fail() { failed=$((failed + 1)); printf 'FAIL  %s\n' "$*" >&2; }
expect() { # label expected actual
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1: expected '$2', got '$3'"; fi
}
expect_in() { # label needle haystack
  if grep -qF -- "$2" <<< "$3"; then pass "$1"; else fail "$1: '$2' not found in: $3"; fi
}

bin="$work/bin"; state="$work/state"; env_file="$work/env"; data="$work/data"; backups="$work/backups"
mkdir -p "$bin"
domain=resto.example.test

# --- stand-ins and fixtures ---------------------------------------------------------------------
cat > "$bin/df" <<'SH'
#!/usr/bin/env bash
used="${STUB_DF_USED_PCT:-50}"
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/stub 1000000 %s %s %s%% /\n' "$((used * 10000))" "$(((100 - used) * 10000))" "$used"
SH
cat > "$bin/systemctl" <<'SH'
#!/usr/bin/env bash
[ ! -e "$STUB_STATE/timer-inactive" ]
SH
cat > "$work/smoke" <<'SH'
#!/usr/bin/env bash
if [ -e "$STUB_STATE/smoke-fails" ]; then echo "container backend is unhealthy"; exit 1; fi
echo "SMOKE OK"
SH
chmod +x "$bin/df" "$bin/systemctl" "$work/smoke"

free_port() { python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }

# serve_cert <days>: a TLS server on a free port whose certificate has <days> left.
port=""
serve_cert() {
  stop_server
  openssl req -x509 -newkey rsa:2048 -nodes -days "$1" -subj "/CN=$domain" \
    -keyout "$work/key.pem" -out "$work/cert.pem" >/dev/null 2>&1
  # A certificate's expiry has one-second resolution: checked within the second it was made it
  # still has exactly N days, a second later N-1 (what a real check always sees).
  sleep 1.2
  port="$(free_port)"
  openssl s_server -accept "127.0.0.1:$port" -cert "$work/cert.pem" -key "$work/key.pem" -www -quiet >/dev/null 2>&1 &
  server_pid=$!
  for _ in $(seq 1 50); do
    (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && return 0
    sleep 0.1
  done
  echo "the test TLS server did not start" >&2; exit 1
}

# backup_aged <hours>: one backup archive that old, with a matching checksum.
backup_aged() {
  mkdir -p "$backups/daily"
  rm -f "$backups"/daily/*
  local archive="$backups/daily/openresto-20260101-030000.tar.gz"
  echo "archive content" > "$archive"
  (cd "$backups/daily" && sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256")
  touch -d "$1 hours ago" "$archive"
}

healthy_baseline() {
  rm -rf "$state" "$data" "$backups" "$env_file" "$work/reboot"
  mkdir -p "$state" "$data"
  cat > "$env_file" <<ENV
DOMAIN=$domain
DATA_DIR=$data
BACKUP_DIR=$backups
OPENRESTO_VERSION=2.4.1
ENV
  chmod 600 "$env_file"
  used_pct=50
  backup_aged 2
  serve_cert 60
}

out=""; code=0; cert_timeout=10; run_limit=120
run_health() {
  set +e
  out="$(env -i PATH="$bin:$PATH" HOME="$work" STUB_STATE="$state" STUB_DF_USED_PCT="$used_pct" \
    ENV_FILE="$env_file" HEALTH_SMOKE="$work/smoke" HEALTH_HOST=127.0.0.1 HEALTH_PORT="$port" \
    HEALTH_CERT_TIMEOUT="$cert_timeout" REBOOT_REQUIRED_FILE="$work/reboot" \
    timeout "$run_limit" "$here/health.sh" 2>&1)"
  code=$?
  set -e
}

# --- the healthy case -----------------------------------------------------------------------------
healthy_baseline; run_health
expect "healthy instance: exit 0" 0 "$code"
expect_in "healthy instance: says so" "HEALTH OK" "$out"
grep -qE '^(WARN|FAIL)' <<< "$out" && fail "healthy instance: printed a warning or failure" || pass "healthy instance: no warning, no failure"

# --- the stack ------------------------------------------------------------------------------------
healthy_baseline; : > "$state/smoke-fails"; run_health
expect "stack unhealthy: exit 2" 2 "$code"
expect_in "stack unhealthy: shows what smoke.sh said" "container backend is unhealthy" "$out"

# --- certificate: warn under 14 days, fail under 3, both sides of each ------------------------------
# `openssl -days N` leaves N days minus a few seconds, which the check floors to N-1.
healthy_baseline; serve_cert 15; run_health
expect "certificate with 14 days left: ok" 0 "$code"
serve_cert 14; run_health
expect "certificate with 13 days left: warning" 1 "$code"
expect_in "certificate with 13 days left: says renewal should have happened" "renewal should have happened" "$out"
serve_cert 4; run_health
expect "certificate with 3 days left: still a warning" 1 "$code"
serve_cert 3; run_health
expect "certificate with 2 days left: failure" 2 "$code"
expect_in "certificate with 2 days left: says how many days" "expires in 2 day(s)" "$out"
stop_server; port="$(free_port)"; run_health
expect "no TLS answer at all: failure" 2 "$code"
expect_in "no TLS answer at all: says so" "cannot read the certificate" "$out"

# A host that takes the connection and never speaks must cost the probe its timeout, not hang the
# check. `run_limit` is the harness's own guard: a probe with no timeout is killed there (code 124)
# and fails the assertion instead of hanging the suite.
cat > "$work/hang.py" <<'PY'
import socket, sys
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", int(sys.argv[1])))
s.listen(5)
held = []
while True:
    held.append(s.accept()[0])
PY
healthy_baseline; stop_server; port="$(free_port)"
python3 "$work/hang.py" "$port" & server_pid=$!
for _ in $(seq 1 50); do (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && break; sleep 0.1; done
cert_timeout=2; run_limit=15; SECONDS=0; run_health; elapsed=$SECONDS; cert_timeout=10; run_limit=120
expect "silent TLS host: failure, not a hang" 2 "$code"
expect_in "silent TLS host: says it cannot read the certificate" "cannot read the certificate" "$out"
[ "$elapsed" -lt 12 ] && pass "silent TLS host: gave up after the 2 s timeout (${elapsed}s in all)" || fail "silent TLS host: took ${elapsed}s"
stop_server

# --- disk: warn under 20% free, fail under 8% ---------------------------------------------------------
healthy_baseline; used_pct=80; run_health
expect "20% free: ok" 0 "$code"
used_pct=81; run_health
expect "19% free: warning" 1 "$code"
used_pct=92; run_health
expect "8% free: still a warning" 1 "$code"
used_pct=93; run_health
expect "7% free: failure" 2 "$code"
expect_in "7% free: names the volume" "data ($data): 7% free" "$out"
healthy_baseline; rmdir "$data"; run_health
expect "missing data directory: failure" 2 "$code"

# --- backups: warn past 36h, fail past 72h, checksum, timer -------------------------------------------
healthy_baseline; backup_aged 36; run_health
expect "36 hours old: ok" 0 "$code"
backup_aged 37; run_health
expect "37 hours old: warning" 1 "$code"
backup_aged 72; run_health
expect "72 hours old: still a warning" 1 "$code"
backup_aged 73; run_health
expect "73 hours old: failure" 2 "$code"

# No backup at all: a warning on a fresh install, a failure once the instance is old enough to
# have had its first one (same 36 hour line as a stale backup).
healthy_baseline; rm -f "$backups"/daily/*; run_health
expect "fresh install, no backup yet: warning, not failure" 1 "$code"
expect_in "fresh install, no backup yet: says so" "no backup yet" "$out"
touch -d "36 hours ago" "$env_file"; run_health
expect "instance 36 hours old, no backup: still a warning" 1 "$code"
touch -d "37 hours ago" "$env_file"; run_health
expect "instance 37 hours old, no backup: failure" 2 "$code"
expect_in "instance 37 hours old, no backup: says how old" "the instance is 37h old" "$out"

healthy_baseline; echo "tampered" >> "$backups/daily/openresto-20260101-030000.tar.gz"; run_health
expect "checksum mismatch: failure" 2 "$code"
expect_in "checksum mismatch: says so" "does not match" "$out"
healthy_baseline; rm "$backups/daily/openresto-20260101-030000.tar.gz.sha256"; run_health
expect "checksum file missing: failure" 2 "$code"

healthy_baseline; : > "$state/timer-inactive"; run_health
expect "backup timer inactive: warning" 1 "$code"
expect_in "backup timer inactive: mentions cron as the alternative" "ignore this if cron" "$out"

# --- settings -------------------------------------------------------------------------------------------
healthy_baseline; chmod 644 "$env_file"; run_health
expect ".env readable by everyone: warning" 1 "$code"
expect_in ".env readable by everyone: says what it holds" "JWT key and the admin password" "$out"

healthy_baseline; sed_free_env="$(cat "$env_file")"; printf '%s\n' "${sed_free_env/2.4.1/latest}" > "$env_file"; run_health
expect "version 'latest': failure" 2 "$code"

healthy_baseline; : > "$work/reboot"; run_health
expect "reboot pending: warning" 1 "$code"

# --- the verdict is the worst finding, and the summary counts them --------------------------------------
healthy_baseline; used_pct=95; backup_aged 100; : > "$state/timer-inactive"; run_health
expect "several findings: exit 2" 2 "$code"
expect_in "several findings: counts failures and warnings" "HEALTH FAIL (3 failure(s), 1 warning(s))" "$out"

echo
echo "passed: $passed  failed: $failed"
[ "$failed" -eq 0 ]
