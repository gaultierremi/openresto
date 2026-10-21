#!/usr/bin/env bash
# Behaviour of install.sh, run against stand-ins for every command that touches the machine
# (docker, systemctl, apt-get, ufw, ss, getent, ...). Needs no Docker, no root and no network,
# and writes only under a scratch directory.
#
#   deploy/tests/install.test.sh
#
# What it pins is the contract that matters on a real server: a refused run writes nothing and
# starts nothing, a rerun never rewrites .env, the admin password is never printed, the firewall
# keeps SSH open before it turns on, and each failure has its own exit code.
# pass() cannot fail, so "A && pass || fail" below is a real if/else.
# The stand-ins are scripts written to disk, so their bodies are single-quoted on purpose.
# shellcheck disable=SC2015,SC2016
set -Eeuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
passed=0; failed=0

pass() { passed=$((passed + 1)); printf 'PASS  %s\n' "$*"; }
fail() { failed=$((failed + 1)); printf 'FAIL  %s\n' "$*" >&2; }
expect() { # label expected actual
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1: expected '$2', got '$3'"; fi
}
expect_in() { # label needle haystack
  if grep -qF -- "$2" <<< "$3"; then pass "$1"; else fail "$1: '$2' not found in: $3"; fi
}

bin="$work/bin"; state="$work/state"; calls="$work/calls.log"
env_file="$work/env"; data="$work/data"; backups="$work/backups"; units="$work/units"
mkdir -p "$bin"

# --- stand-ins ----------------------------------------------------------------------------------
stub() { # name, body
  printf '#!/usr/bin/env bash\necho "%s $*" >> "$CALLS"\n%s\n' "$1" "$2" > "$bin/$1"
  chmod +x "$bin/$1"
}
stub docker '
case "$*" in
  "compose version") [ -e "$STUB_STATE/docker-installed" ] ;;
  *"ps -q caddy"*) [ ! -e "$STUB_STATE/stack-running" ] || echo caddy-container; exit 0 ;;
  *" pull") [ ! -e "$STUB_STATE/pull-fails" ] ;;
  *" build") [ ! -e "$STUB_STATE/build-fails" ] ;;
  *" up "*) [ ! -e "$STUB_STATE/up-fails" ] ;;
  *) exit 0 ;;
esac'
stub systemctl '
if [ "$1 $2" = "start openresto-backup.service" ] && [ -e "$STUB_STATE/backup-ok" ]; then
  mkdir -p "$STUB_BACKUP_DIR/daily"; : > "$STUB_BACKUP_DIR/daily/openresto-20260101-030000.tar.gz"
fi
exit 0'
stub apt-get 'case "$*" in *docker-ce*) : > "$STUB_STATE/docker-installed" ;; esac'
stub ufw 'exit 0'
stub dpkg 'echo amd64'
stub curl 'while [ $# -gt 0 ]; do [ "$1" = -o ] && : > "$2"; shift; done'
stub ss 'port="${!#}"; port="${port##*:}"; case ",${STUB_BUSY_PORTS:-}," in *",$port,"*) echo "LISTEN 0 4096 0.0.0.0:$port 0.0.0.0:*" ;; esac'
stub getent '[ -e "$STUB_STATE/dns-ok" ] && echo "203.0.113.10 STREAM $2" || exit 2'
stub hostname 'echo "${STUB_HOST_IPS:-203.0.113.10 10.0.0.5}"'
stub sshd 'echo "port ${STUB_SSH_PORT:-22}"'
cat > "$work/smoke" <<'SH'
#!/usr/bin/env bash
echo "smoke" >> "$CALLS"; [ ! -e "$STUB_STATE/smoke-fails" ] && echo "SMOKE OK" || { echo "SMOKE FAILED"; exit 1; }
SH
cat > "$work/health" <<'SH'
#!/usr/bin/env bash
echo "health" >> "$CALLS"; exit "$(cat "$STUB_STATE/health-code" 2>/dev/null || echo 0)"
SH
chmod +x "$work/smoke" "$work/health"
printf 'ID=ubuntu\nVERSION_CODENAME=noble\n' > "$work/os-ubuntu"
printf 'ID=fedora\nVERSION_CODENAME=\n' > "$work/os-fedora"
printf 'MemTotal:        4046832 kB\n' > "$work/mem-ok"
printf 'MemTotal:        1017000 kB\n' > "$work/mem-low"

# --- running one scenario ----------------------------------------------------------------------
reset() {
  rm -rf "$env_file" "$data" "$backups" "$units" "$state" "$work/apt"
  mkdir -p "$state"
  : > "$state/docker-installed"; : > "$state/dns-ok"; : > "$state/backup-ok"
  : > "$calls"
  os_file="$work/os-ubuntu"; mem_file="$work/mem-ok"; uid=0; busy=""; ssh_port=22; host_ips="203.0.113.10 10.0.0.5"
}
std=(--domain resto.example.be --email ops@example.be --data-dir "$data" --backup-dir "$backups")

out=""; code=0
run_install() {
  : > "$calls"
  set +e
  out="$(env -i PATH="$bin:$PATH" HOME="$work" CALLS="$calls" STUB_STATE="$state" STUB_BACKUP_DIR="$backups" \
    STUB_BUSY_PORTS="$busy" STUB_SSH_PORT="$ssh_port" STUB_HOST_IPS="$host_ips" \
    ENV_FILE="$env_file" INSTALL_UID="$uid" OS_RELEASE_FILE="$os_file" MEMINFO_FILE="$mem_file" \
    SYSTEMD_DIR="$units" APT_KEYRINGS_DIR="$work/apt/keyrings" APT_SOURCES_DIR="$work/apt/sources" \
    INSTALL_SMOKE="$work/smoke" INSTALL_HEALTH="$work/health" INSTALL_RETRY_SLEEP=0 \
    "$here/install.sh" "$@" 2>&1)"
  code=$?
  set -e
}

val() { grep -E "^$1=" "$env_file" | tail -n 1 | cut -d= -f2-; }
touched_machine() { grep -Eq '^(systemctl|ufw|apt-get|curl) |^docker compose .* (pull|up ) ' "$calls"; }

# A refusal must leave no trace: no .env, no data directory, nothing started or installed.
expect_refused() { # label expected-message-fragment
  expect "$1: exit 1" 1 "$code"
  expect_in "$1: says why" "$2" "$out"
  { [ ! -e "$env_file" ] && [ ! -e "$data" ] && [ ! -e "$backups" ] && [ ! -e "$units" ] && ! touched_machine; } \
    && pass "$1: nothing written, nothing started" || fail "$1: left a trace"
}

# --- refusals ------------------------------------------------------------------------------------
reset; run_install
expect_refused "no arguments" "--domain is required"

reset; run_install --domain resto.example.be
expect_refused "no contact e-mail" "--email is required"

for bad in localhost 10.0.0.1 Resto.Example.BE bad_domain.be no-tld; do
  reset; run_install --domain "$bad" --email ops@example.be --data-dir "$data" --backup-dir "$backups"
  expect_refused "domain '$bad'" "is not a public host name"
done

reset; run_install --domain resto.example.be --email not-an-email --data-dir "$data" --backup-dir "$backups"
expect_refused "invalid e-mail" "is not an e-mail address"

reset; run_install "${std[@]}" --version latest
expect_refused "version latest" "is not an exact release"

reset; uid=1000; run_install "${std[@]}"
expect_refused "not root" "run as root"

reset; os_file="$work/os-fedora"; run_install "${std[@]}"
expect_refused "unsupported distribution" "is not supported"

reset; busy="80"; run_install "${std[@]}"
expect_refused "port 80 taken by something else" "port 80 is already in use"

reset; busy="443"; run_install "${std[@]}"
expect_refused "port 443 taken by something else" "port 443 is already in use"

reset; rm "$state/dns-ok"; run_install "${std[@]}"
expect_refused "domain not resolving" "does not resolve yet"

reset; rm "$state/docker-installed"; run_install "${std[@]}"
expect_refused "Docker missing without --install-docker" "--install-docker"

reset; ssh_port=2222; run_install "${std[@]}" --firewall
expect_refused "firewall while sshd listens elsewhere" "pass --ssh-port 2222"

reset; run_install "${std[@]}" --ssh-port 70000 --firewall
expect_refused "firewall with a port out of range" "is not a port number"

reset; run_install "${std[@]}" --bogus
expect_refused "unknown option" "unknown option: --bogus"

# An .env that exists but is incomplete is refused untouched, not silently completed.
reset; cp "$here/.env.example" "$env_file"; before="$(sha256sum "$env_file")"; run_install "${std[@]}"
expect "incomplete .env: exit 1" 1 "$code"
expect_in "incomplete .env: names the empty key" "JWT_KEY is empty" "$out"
expect "incomplete .env: file untouched" "$before" "$(sha256sum "$env_file")"
touched_machine && fail "incomplete .env: started something" || pass "incomplete .env: nothing started"

# --- a fresh install -----------------------------------------------------------------------------
reset; run_install "${std[@]}"
expect "fresh install: exit 0" 0 "$code"
expect "fresh install: .env is private" 600 "$(stat -c %a "$env_file")"
expect "fresh install: domain" resto.example.be "$(val DOMAIN)"
expect "fresh install: ACME contact" ops@example.be "$(val ACME_EMAIL)"
expect "fresh install: admin defaults to the contact" ops@example.be "$(val ADMIN_EMAIL)"
expect "fresh install: version from .env.example" "$(grep -E '^OPENRESTO_VERSION=' "$here/.env.example" | cut -d= -f2-)" "$(val OPENRESTO_VERSION)"
expect "fresh install: data dir from the flag" "$data" "$(val DATA_DIR)"
jwt="$(val JWT_KEY)"; password="$(val ADMIN_PASSWORD)"
[ "${#jwt}" -ge 60 ] && pass "fresh install: JWT key is 64 characters of base64" || fail "fresh install: JWT key too short (${#jwt})"
[ "${#password}" -ge 24 ] && pass "fresh install: admin password is long" || fail "fresh install: admin password too short (${#password})"
grep -qF -- "$password" <<< "$out" && fail "fresh install: the admin password was printed" || pass "fresh install: the admin password is not printed"
grep -qF -- "$jwt" <<< "$out" && fail "fresh install: the JWT key was printed" || pass "fresh install: the JWT key is not printed"
expect "fresh install: keeps the rest of .env.example" "$(grep -E '^BACKUP_KEEP_DAILY=' "$here/.env.example")" "$(grep -E '^BACKUP_KEEP_DAILY=' "$env_file")"
expect "fresh install: backup dir is private" 700 "$(stat -c %a "$backups")"
expect "fresh install: data dir (database, keys) is private" 700 "$(stat -c %a "$data")"
[ -d "$data" ] && pass "fresh install: data dir created" || fail "fresh install: data dir missing"
pull_line="$(grep -n ' pull$' "$calls" | head -n 1 | cut -d: -f1)"
up_line="$(grep -n ' up -d --wait' "$calls" | head -n 1 | cut -d: -f1)"
[ -n "$pull_line" ] && [ -n "$up_line" ] && [ "$pull_line" -lt "$up_line" ] && pass "fresh install: pulls, then starts and waits for health" || fail "fresh install: pull/up order ($pull_line, $up_line)"
grep -q '^smoke' "$calls" && grep -q '^health' "$calls" && pass "fresh install: ends on the smoke test and the health check" || fail "fresh install: smoke or health never ran"
grep -qF "$here" "$units/openresto-backup.service" && pass "fresh install: the service runs the backup from this checkout" || fail "fresh install: unit does not point at $here"
[ "$here" = /opt/openresto/deploy ] || { grep -q '/opt/openresto/deploy' "$units/openresto-backup.service" && fail "fresh install: unit kept the hardcoded path" || pass "fresh install: no hardcoded /opt path left in the unit"; }
enable_line="$(grep -n 'enable --now openresto-backup.timer' "$calls" | head -n 1 | cut -d: -f1)"
start_line="$(grep -n 'start openresto-backup.service' "$calls" | head -n 1 | cut -d: -f1)"
[ -n "$enable_line" ] && [ -n "$start_line" ] && [ "$enable_line" -lt "$start_line" ] && pass "fresh install: timer enabled, then the first backup" || fail "fresh install: timer/backup order"
grep -q '^ufw' "$calls" && fail "fresh install: touched the firewall without --firewall" || pass "fresh install: firewall untouched without --firewall"
grep -q '^apt-get' "$calls" && fail "fresh install: installed packages without being asked" || pass "fresh install: no package installed without being asked"
expect_in "fresh install: tells where the password is" "ADMIN_PASSWORD line of" "$out"
# The real Docker CLI (not the stand-in: that one only exists inside install.sh's environment)
# resolves the prod compose with the generated file, so a required variable the installer forgot
# to fill is caught here and not on a customer's server. `config` needs no daemon.
if command -v docker >/dev/null 2>&1; then
  docker compose --env-file "$env_file" -f "$here/docker-compose.prod.yml" config -q >/dev/null 2>&1 \
    && pass "fresh install: the generated .env satisfies docker-compose.prod.yml" \
    || fail "fresh install: docker-compose.prod.yml refuses the generated .env"
else
  echo "SKIP  fresh install: no docker CLI, the generated .env was not checked against the compose file"
fi

# --- running it again ----------------------------------------------------------------------------
before="$(sha256sum "$env_file")"; : > "$state/stack-running"; busy="80,443"
run_install "${std[@]}"
expect "rerun: exit 0 although 80 and 443 are held (by our own Caddy)" 0 "$code"
expect "rerun: .env is byte-for-byte unchanged (no new JWT key)" "$before" "$(sha256sum "$env_file")"

run_install "${std[@]}" --version 9.9.9
expect "rerun with another version: exit 1" 1 "$code"
expect_in "rerun with another version: points at update.sh" "update.sh" "$out"
expect "rerun with another version: .env unchanged" "$before" "$(sha256sum "$env_file")"

run_install --domain other.example.be --email ops@example.be --data-dir "$data" --backup-dir "$backups"
expect "rerun with another domain: exit 1" 1 "$code"
expect_in "rerun with another domain: says so" "differs from DOMAIN=resto.example.be" "$out"

# A data directory that already exists may be a shared parent: it is reported, never chmod-ed.
reset; mkdir -p "$data"; chmod 755 "$data"; run_install "${std[@]}"
expect "existing open data dir: still installs" 0 "$code"
expect "existing open data dir: mode left alone" 755 "$(stat -c %a "$data")"
expect_in "existing open data dir: warns" "is open to other users" "$out"
reset; mkdir -p "$data"; chmod 700 "$data"; run_install "${std[@]}"
grep -q "is open to other users" <<< "$out" && fail "private data dir: warned for nothing" || pass "private data dir: no warning"

# --- optional parts ------------------------------------------------------------------------------
reset; ssh_port=2222; run_install "${std[@]}" --firewall --ssh-port 2222
expect "firewall: exit 0" 0 "$code"
allow_ssh="$(grep -n '^ufw allow 2222/tcp' "$calls" | head -n 1 | cut -d: -f1)"
enable_fw="$(grep -n '^ufw --force enable' "$calls" | head -n 1 | cut -d: -f1)"
[ -n "$allow_ssh" ] && [ -n "$enable_fw" ] && [ "$allow_ssh" -lt "$enable_fw" ] && pass "firewall: SSH is allowed before ufw is turned on" || fail "firewall: order ($allow_ssh, $enable_fw)"
grep -q '^ufw allow 22/tcp' "$calls" && fail "firewall: opened the default SSH port too" || pass "firewall: only the real SSH port is opened"
for rule in 'allow 80/tcp' 'allow 443/tcp' 'allow 443/udp' 'default deny incoming'; do
  grep -q "^ufw $rule" "$calls" && pass "firewall: $rule" || fail "firewall: missing $rule"
done

reset; rm "$state/docker-installed"; run_install "${std[@]}" --install-docker
expect "docker install: exit 0" 0 "$code"
grep -q '^apt-get install -y -qq docker-ce' "$calls" && pass "docker install: installs the engine and the compose plugin" || fail "docker install: engine not installed"
sources="$(cat "$work/apt/sources/docker.list" 2>/dev/null || true)"
expect_in "docker install: official repository for this release" "download.docker.com/linux/ubuntu noble stable" "$sources"
expect_in "docker install: key is checked" "signed-by=" "$sources"

# --build: the images come from this checkout, under a registry name of their own.
reset; run_install "${std[@]}" --build
expect "--build: exit 0" 0 "$code"
grep -qE '^docker compose .*docker-compose\.build\.yml build$' "$calls" && pass "--build: builds with the build override" || fail "--build: no build call with docker-compose.build.yml"
grep -q ' pull$' "$calls" && fail "--build: pulled upstream images as well" || pass "--build: pulls nothing"
expect "--build: images get a registry name that cannot be pulled (localhost)" localhost "$(val OPENRESTO_REGISTRY)"
build_line="$(grep -n ' build$' "$calls" | head -n 1 | cut -d: -f1)"; up_line="$(grep -n ' up -d --wait' "$calls" | head -n 1 | cut -d: -f1)"
[ -n "$build_line" ] && [ -n "$up_line" ] && [ "$build_line" -lt "$up_line" ] && pass "--build: builds, then starts" || fail "--build: build/up order ($build_line, $up_line)"
grep ' up -d --wait' "$calls" | grep -q 'docker-compose.build.yml' && pass "--build: starts with the same override (so up does not pull)" || fail "--build: up without the override"

reset; run_install "${std[@]}" --build --registry registry.example.be/openresto
expect "--build --registry: the registry is the one given" registry.example.be/openresto "$(val OPENRESTO_REGISTRY)"

reset; mem_file="$work/mem-low"; run_install "${std[@]}" --build
expect_in "--build on 1 GB: warns about the frontend build" "building the frontend wants about 4 GB" "$out"

reset; : > "$state/build-fails"; run_install "${std[@]}" --build
expect "--build fails: exit 1" 1 "$code"
expect_in "--build fails: points at memory" "almost always memory" "$out"
grep -q ' up ' "$calls" && fail "--build fails: started the stack anyway" || pass "--build fails: nothing started"

reset; run_install "${std[@]}"
grep -q ' build$' "$calls" && fail "without --build: built images" || pass "without --build: no build"

reset; run_install "${std[@]}" --no-backup-timer
expect "no timer: exit 0" 0 "$code"
grep -q '^systemctl' "$calls" && fail "no timer: still talked to systemd" || pass "no timer: systemd untouched"

reset; run_install "${std[@]}" --preflight-only
expect "preflight only: exit 0" 0 "$code"
expect_in "preflight only: says nothing was written" "nothing was written" "$out"
{ [ ! -e "$env_file" ] && [ ! -e "$data" ] && [ ! -e "$units" ] && ! touched_machine; } && pass "preflight only: no trace" || fail "preflight only: left a trace"

# --- warnings do not stop it; failures after the start have their own exit codes ---------------
reset; mem_file="$work/mem-low"; run_install "${std[@]}"
expect "low memory: still installs" 0 "$code"
expect_in "low memory: warns" "WARN: 993 MB of memory" "$out"

reset; host_ips="198.51.100.7"; run_install "${std[@]}"
expect "DNS pointing elsewhere: still installs (NAT)" 0 "$code"
expect_in "DNS pointing elsewhere: warns" "not an address of this machine" "$out"

reset; rm "$state/dns-ok"; run_install "${std[@]}" --skip-dns-check
expect "--skip-dns-check: installs" 0 "$code"

reset; : > "$state/pull-fails"; run_install "${std[@]}"
expect "pull fails: exit 1" 1 "$code"
expect_in "pull fails: names the settings to check" "OPENRESTO_REGISTRY" "$out"
grep -q ' up ' "$calls" && fail "pull fails: started the stack anyway" || pass "pull fails: nothing started"

reset; : > "$state/up-fails"; run_install "${std[@]}"
expect "stack never healthy: exit 2" 2 "$code"
grep -q ' down' "$calls" && fail "stack never healthy: tore the stack down" || pass "stack never healthy: left up for inspection"

reset; : > "$state/smoke-fails"; run_install "${std[@]}"
expect "https never answers: exit 2" 2 "$code"
expect_in "https never answers: names the usual cause" "DNS or port 80" "$out"
[ "$(grep -c '^smoke' "$calls")" = 6 ] && pass "https never answers: retried six times" || fail "https never answers: $(grep -c '^smoke' "$calls") attempts"
[ ! -e "$units" ] && pass "https never answers: no backup timer installed yet" || fail "https never answers: went on to the timer"

reset; rm "$state/backup-ok"; run_install "${std[@]}"
expect "first backup missing: exit 3" 3 "$code"

reset; echo 2 > "$state/health-code"; run_install "${std[@]}"
expect "health check fails: exit 2" 2 "$code"

reset; echo 1 > "$state/health-code"; run_install "${std[@]}"
expect "health check only warns: install succeeds" 0 "$code"

echo
echo "passed: $passed  failed: $failed"
[ "$failed" -eq 0 ]
