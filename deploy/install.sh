#!/usr/bin/env bash
# Installs the production kit on a fresh Debian or Ubuntu VM with one command.
#
#   sudo ./install.sh --domain reservations.example.be --email ops@example.be
#
# Every check runs first and nothing is written until all of them pass. Then, in order: Docker
# (only with --install-docker), .env with generated secrets, the data directories, the optional
# firewall, the images, the stack, a daily backup timer with a first backup, and health.sh.
#
# Safe to run again. An existing .env is validated and never rewritten (a new JWT_KEY would sign
# every user out), and every other step is idempotent. The generated admin password goes into
# .env (mode 600) and is never printed.
#
# Exit codes: 1 refused or failed before anything started, 2 started but not healthy,
#             3 healthy but the first backup failed.
set -Eeuo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=backup/lib.sh
. "$here/backup/lib.sh"

# Overridable so the test can run the whole script against a scratch directory.
os_release="${OS_RELEASE_FILE:-/etc/os-release}"
meminfo="${MEMINFO_FILE:-/proc/meminfo}"
systemd_dir="${SYSTEMD_DIR:-/etc/systemd/system}"
apt_keyrings="${APT_KEYRINGS_DIR:-/etc/apt/keyrings}"
apt_sources="${APT_SOURCES_DIR:-/etc/apt/sources.list.d}"
smoke="${INSTALL_SMOKE:-$here/smoke.sh}"
health="${INSTALL_HEALTH:-$here/health.sh}"

readonly EXIT_NOT_HEALTHY=2
readonly EXIT_BACKUP_FAILED=3
readonly MIN_MEMORY_MB=1800
# The frontend build needs about 3 GB; leave room for the rest of the machine.
readonly MIN_BUILD_MEMORY_MB=3500
readonly MIN_DISK_MB=5120

warn() { log "WARN: $*" >&2; }

usage() {
  cat <<'USAGE'
Usage: sudo ./install.sh --domain <host> --email <contact> [options]

  --domain <host>        public host name, already pointing at this VM (DNS A record)
  --email <address>      contact Let's Encrypt writes to before a certificate expires
  --admin-email <addr>   first Owner account (default: --email)
  --version <x.y.z>      release to run (default: the one in .env.example; never "latest")
  --registry <path>      image registry (default: the one in .env.example; "localhost" with --build)
  --build                build the images from this checkout instead of pulling them (needed for
                         anything newer than the upstream 2.4.1 images; wants about 4 GB of RAM)
  --data-dir <path>      database and keys (default /srv/openresto)
  --backup-dir <path>    backups (default /srv/openresto-backups)
  --install-docker       install Docker from its official apt repository if it is missing
  --firewall             configure ufw: SSH, 80/tcp, 443/tcp, 443/udp, everything else closed
  --ssh-port <port>      SSH port to keep open with --firewall (default 22)
  --skip-dns-check       go on although the host name does not resolve yet
  --no-backup-timer      do not install the daily backup timer
  --preflight-only       run the checks, write nothing, start nothing
USAGE
}

domain=""; acme_email=""; admin_email=""; version=""; registry=""; data_dir=""; backup_dir=""
install_docker=0; firewall=0; ssh_port=""; check_dns=1; backup_timer=1; preflight_only=0; build_from_source=0

take() { [ -n "${2:-}" ] || die "$1 needs a value"; }
parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --domain) take "$@"; domain="$2"; shift 2 ;;
      --email) take "$@"; acme_email="$2"; shift 2 ;;
      --admin-email) take "$@"; admin_email="$2"; shift 2 ;;
      --version) take "$@"; version="$2"; shift 2 ;;
      --registry) take "$@"; registry="$2"; shift 2 ;;
      --data-dir) take "$@"; data_dir="$2"; shift 2 ;;
      --backup-dir) take "$@"; backup_dir="$2"; shift 2 ;;
      --ssh-port) take "$@"; ssh_port="$2"; shift 2 ;;
      --build) build_from_source=1; shift ;;
      --install-docker) install_docker=1; shift ;;
      --firewall) firewall=1; shift ;;
      --skip-dns-check) check_dns=0; shift ;;
      --no-backup-timer) backup_timer=0; shift ;;
      --preflight-only) preflight_only=1; shift ;;
      -h | --help) usage; exit 0 ;;
      *) usage >&2; die "unknown option: $1" ;;
    esac
  done
}

valid_domain() { [[ "$1" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$ ]]; }
valid_email() { [[ "$1" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; }
valid_version() { [ "$1" != latest ] && [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.]+)?$ ]]; }
valid_port() { [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -ge 1 ] && [ "$1" -le 65535 ]; }

example_value() { ENV_FILE="$here/.env.example" env_get "$1"; }

env_existed=0
required_keys=(DOMAIN ACME_EMAIL OPENRESTO_VERSION JWT_KEY ADMIN_EMAIL ADMIN_PASSWORD)

# A flag given on a rerun must agree with the .env that is already there: the file is the
# source of truth, and ignoring a contradicting flag would let the operator believe it applied.
agree() { # flag given key
  [ -z "$2" ] || [ "$2" = "$(env_get "$3")" ] \
    || die "$1 $2 differs from $3=$(env_get "$3") in $ENV_FILE; edit the file if you mean to change it (upgrades go through update.sh)"
}

# Settles every value the install will use, from the flags and, on a rerun, from the .env.
resolve_config() {
  if [ -f "$ENV_FILE" ]; then
    env_existed=1
    local key
    for key in "${required_keys[@]}"; do
      [ -n "$(env_get "$key")" ] || die "$key is empty in $ENV_FILE; fill it in (or move the file aside to start over)"
    done
    agree --domain "$domain" DOMAIN
    agree --email "$acme_email" ACME_EMAIL
    agree --admin-email "$admin_email" ADMIN_EMAIL
    agree --version "$version" OPENRESTO_VERSION
    agree --registry "$registry" OPENRESTO_REGISTRY
    agree --data-dir "$data_dir" DATA_DIR
    agree --backup-dir "$backup_dir" BACKUP_DIR
    domain="$(env_get DOMAIN)"
    acme_email="$(env_get ACME_EMAIL)"
    admin_email="$(env_get ADMIN_EMAIL)"
    version="$(env_get OPENRESTO_VERSION)"
    registry="$(env_get OPENRESTO_REGISTRY "$(example_value OPENRESTO_REGISTRY)")"
    data_dir="$(env_get DATA_DIR "$(example_value DATA_DIR)")"
    backup_dir="$(env_get BACKUP_DIR "$(example_value BACKUP_DIR)")"
    if [ "$registry" = localhost ]; then
      # An install made with --build has no registry behind its image names: rerunning it
      # without the flag must rebuild, not fail on a pull.
      [ "$build_from_source" = 1 ] || log "OPENRESTO_REGISTRY=localhost: this install was built from source, so it is rebuilt, not pulled"
      build_from_source=1
    elif [ "$build_from_source" = 1 ]; then
      die "--build, but $ENV_FILE names the registry '$registry', so the built images would take that registry's name; set OPENRESTO_REGISTRY=localhost in the file first"
    fi
  else
    [ -n "$domain" ] || { usage >&2; die "--domain is required"; }
    [ -n "$acme_email" ] || { usage >&2; die "--email is required"; }
    admin_email="${admin_email:-$acme_email}"
    version="${version:-$(example_value OPENRESTO_VERSION)}"
    # Built images must not be named like anything a registry could serve. "localhost" is read by
    # Docker as a registry host, so a stray `docker compose pull` fails; a plain "local" is an
    # ordinary Docker Hub namespace, which anyone could register and fill.
    if [ "$build_from_source" = 1 ]; then registry="${registry:-localhost}"; fi
    registry="${registry:-$(example_value OPENRESTO_REGISTRY)}"
    data_dir="${data_dir:-$(example_value DATA_DIR)}"
    backup_dir="${backup_dir:-$(example_value BACKUP_DIR)}"
  fi
  valid_domain "$domain" || die "'$domain' is not a public host name (lower-case, with a dot; an IP address or localhost cannot get a certificate)"
  valid_email "$acme_email" || die "'$acme_email' is not an e-mail address"
  valid_email "$admin_email" || die "'$admin_email' is not an e-mail address"
  valid_version "$version" || die "'$version' is not an exact release such as 2.4.1 ('latest' is refused: an unattended pull could change the version)"
  case "$DEPLOY_DIR" in *[[:space:]]*) die "$DEPLOY_DIR contains a space; systemd cannot run the backup from there" ;; esac
  if [ "$firewall" = 1 ]; then
    ssh_port="${ssh_port:-22}"
    valid_port "$ssh_port" || die "'$ssh_port' is not a port number"
  fi
}

os_id=""; os_codename=""
check_system() {
  local uid="${INSTALL_UID:-$(id -u)}"
  [ "$uid" = 0 ] || die "run as root (sudo ./install.sh ...)"
  [ -r "$os_release" ] || die "cannot read $os_release"
  # shellcheck disable=SC1090  # /etc/os-release is shell syntax by specification
  os_id="$(. "$os_release"; echo "${ID:-}")"
  # shellcheck disable=SC1090
  os_codename="$(. "$os_release"; echo "${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}")"
  case "$os_id" in
    debian | ubuntu) ;;
    *) die "'$os_id' is not supported: this installer is for Debian and Ubuntu; follow docs/HEBERGEMENT.md section 5 by hand" ;;
  esac
  local tool
  for tool in openssl curl awk getent ss; do
    command -v "$tool" >/dev/null 2>&1 || die "'$tool' is not installed (apt-get install -y openssl curl iproute2 libc-bin)"
  done
  local memory_mb
  memory_mb="$(awk '/^MemTotal:/ { print int($2 / 1024) }' "$meminfo")"
  if [ "${memory_mb:-0}" -lt "$MIN_MEMORY_MB" ]; then
    warn "${memory_mb:-0} MB of memory; the stack wants about 2 GB (docs/HEBERGEMENT.md section 4)"
  fi
  if [ "$build_from_source" = 1 ] && [ "${memory_mb:-0}" -lt "$MIN_BUILD_MEMORY_MB" ]; then
    warn "${memory_mb:-0} MB of memory; building the frontend wants about 4 GB, add swap or build elsewhere"
  fi
}

docker_present=0
check_docker() {
  if docker compose version >/dev/null 2>&1; then docker_present=1; return; fi
  [ "$install_docker" = 1 ] || die "Docker with the compose plugin is not installed; rerun with --install-docker (official apt repository) or follow docs/HEBERGEMENT.md section 5.3"
}

stack_running() {
  [ "$docker_present" = 1 ] && [ -n "$(compose ps -q caddy 2>/dev/null || true)" ]
}

port_in_use() { [ -n "$(ss -H -ltn "sport = :$1" 2>/dev/null || true)" ]; }

check_ports() {
  if stack_running; then return; fi
  local port
  for port in 80 443; do
    if port_in_use "$port"; then
      die "port $port is already in use on this machine; Caddy needs 80 and 443 (see: ss -ltnp 'sport = :$port')"
    fi
  done
}

check_dns_record() {
  [ "$check_dns" = 1 ] || return 0
  local resolved
  resolved="$(getent ahostsv4 "$domain" 2>/dev/null | awk 'NR == 1 { print $1 }' || true)"
  [ -n "$resolved" ] || die "$domain does not resolve yet; create the DNS A record first (or --skip-dns-check)"
  case " $(hostname -I 2>/dev/null || true) " in
    *" $resolved "*) ;;
    *) warn "$domain resolves to $resolved, which is not an address of this machine; fine behind NAT or a load balancer, otherwise the certificate will fail" ;;
  esac
}

check_disk() {
  local probe="$data_dir" free_mb
  while [ ! -e "$probe" ] && [ "$probe" != / ]; do probe="$(dirname "$probe")"; done
  free_mb="$(df -Pk "$probe" | awk 'NR == 2 { print int($4 / 1024) }')"
  if [ "${free_mb:-0}" -lt "$MIN_DISK_MB" ]; then
    warn "${free_mb:-0} MB free where $data_dir will live; images and data want about 5 GB"
  fi
}

# Locking oneself out is the one irreversible mistake here: ufw is only turned on with the port
# sshd really listens on allowed, and a mismatch stops the install before anything is written.
check_firewall() {
  [ "$firewall" = 1 ] || return 0
  local listening
  listening="$(sshd -T 2>/dev/null | awk '$1 == "port" { print $2; exit }' || true)"
  if [ -n "$listening" ] && [ "$listening" != "$ssh_port" ]; then
    die "sshd listens on port $listening but the firewall would keep $ssh_port open; pass --ssh-port $listening"
  fi
}

preflight() {
  check_system
  check_docker
  check_ports
  check_dns_record
  check_disk
  check_firewall
}

install_docker_engine() {
  log "installing Docker from the official apt repository"
  [ -n "$os_codename" ] || die "cannot tell the $os_id release name from $os_release"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl
  install -m 0755 -d "$apt_keyrings" "$apt_sources"
  curl -fsSL "https://download.docker.com/linux/$os_id/gpg" -o "$apt_keyrings/docker.asc"
  chmod a+r "$apt_keyrings/docker.asc"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=$apt_keyrings/docker.asc] https://download.docker.com/linux/$os_id $os_codename stable" \
    > "$apt_sources/docker.list"
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  docker compose version >/dev/null 2>&1 || die "Docker was installed but 'docker compose' does not answer"
  docker_present=1
}

# Replaces KEY=... in a file, or appends it. The value goes through the environment, not the
# command line, so a secret never shows in `ps` and awk does not interpret backslashes in it.
set_env_key() { # file key value
  local file="$1" tmp
  tmp="$(mktemp "$file.XXXXXX")"
  KEY="$2" VALUE="$3" awk '
    BEGIN { key = ENVIRON["KEY"]; value = ENVIRON["VALUE"]; done = 0 }
    !done && index($0, key "=") == 1 { print key "=" value; done = 1; next }
    { print }
    END { if (!done) print key "=" value }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

create_env() {
  [ -f "$here/.env.example" ] || die ".env.example is missing next to install.sh"
  local previous_umask
  previous_umask="$(umask)"
  umask 077
  cp "$here/.env.example" "$ENV_FILE"
  set_env_key "$ENV_FILE" DOMAIN "$domain"
  set_env_key "$ENV_FILE" ACME_EMAIL "$acme_email"
  set_env_key "$ENV_FILE" OPENRESTO_REGISTRY "$registry"
  set_env_key "$ENV_FILE" OPENRESTO_VERSION "$version"
  set_env_key "$ENV_FILE" DATA_DIR "$data_dir"
  set_env_key "$ENV_FILE" BACKUP_DIR "$backup_dir"
  set_env_key "$ENV_FILE" ADMIN_EMAIL "$admin_email"
  set_env_key "$ENV_FILE" JWT_KEY "$(openssl rand -base64 48 | tr -d '\n')"
  set_env_key "$ENV_FILE" ADMIN_PASSWORD "$(openssl rand -hex 16)"
  umask "$previous_umask"
  chmod 600 "$ENV_FILE"
  log "wrote $ENV_FILE (mode 600) with a generated JWT key and admin password"
}

# DATA_DIR holds the database and the Data Protection keys. The container's entrypoint chowns
# its mounted subdirectories itself and the daemon resolves the mount, so the parent can be
# closed to every other user of the host. An existing directory is reported, never chmod-ed:
# --data-dir may name a shared parent such as /srv.
prepare_directories() {
  if [ -d "$data_dir" ]; then
    if [ "$(( 8#$(stat -c %a "$data_dir") & 8#077 ))" -ne 0 ]; then
      warn "$data_dir is open to other users of this machine and holds the database and keys; chmod 700 it"
    fi
  else
    install -d -m 700 "$data_dir"
  fi
  install -d -m 700 "$backup_dir"
}

configure_firewall() {
  [ "$firewall" = 1 ] || return 0
  command -v ufw >/dev/null 2>&1 || apt-get install -y -qq ufw
  log "configuring ufw (SSH on $ssh_port, 80, 443)"
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow "$ssh_port/tcp"
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
  ufw --force enable
}

start_stack() {
  if [ "$build_from_source" = 1 ]; then
    # lib.sh's compose() layers COMPOSE_OVERRIDE on top of the prod file.
    COMPOSE_OVERRIDE="$here/docker-compose.build.yml"
    log "building the images from this checkout (several minutes; the frontend is the slow one)"
    compose build || die "the image build failed; the last lines above say why (a killed frontend build is almost always memory)"
  else
    log "pulling $registry images at $version"
    compose pull || die "could not pull the images; check OPENRESTO_REGISTRY and OPENRESTO_VERSION in $ENV_FILE (the upstream registry has no image for a version that exists only in this fork; use --build)"
  fi
  log "starting the stack"
  if ! compose up -d --wait --wait-timeout 300 --remove-orphans; then
    compose ps >&2 || true
    compose logs --tail=40 >&2 || true
    die "the stack did not become healthy" "$EXIT_NOT_HEALTHY"
  fi
}

# Caddy asks Let's Encrypt for the certificate on the first request, which can take a minute.
wait_for_https() {
  local attempt output
  for attempt in 1 2 3 4 5 6; do
    if output="$("$smoke" 2>&1)"; then
      printf '%s\n' "$output"
      return 0
    fi
    log "https is not answering yet (attempt $attempt of 6)"
    sleep "${INSTALL_RETRY_SLEEP:-10}"
  done
  printf '%s\n' "$output" >&2
  compose logs --tail=30 caddy >&2 || true
  die "the stack is up but https://$domain does not answer correctly; the usual cause is DNS or port 80 (docker compose logs caddy)" "$EXIT_NOT_HEALTHY"
}

install_backup_timer() {
  [ "$backup_timer" = 1 ] || return 0
  local unit content
  mkdir -p "$systemd_dir"
  for unit in openresto-backup.service openresto-backup.timer; do
    content="$(cat "$here/systemd/$unit")"
    printf '%s\n' "${content//\/opt\/openresto\/deploy/$DEPLOY_DIR}" > "$systemd_dir/$unit"
  done
  systemctl daemon-reload
  systemctl enable --now openresto-backup.timer
  log "taking the first backup"
  systemctl start openresto-backup.service || true
  if [ -z "$(find "$backup_dir/daily" -maxdepth 1 -name 'openresto-*.tar.gz' 2>/dev/null | head -n 1)" ]; then
    die "the first backup produced no archive; see: journalctl -u openresto-backup.service" "$EXIT_BACKUP_FAILED"
  fi
}

summary() {
  cat <<SUMMARY

OpenResto $version is running at https://$domain

  Sign in at https://$domain/admin as $admin_email.
  The password was generated; it is the ADMIN_PASSWORD line of $ENV_FILE
  (mode 600, not printed here). Change it at the first sign-in.

  Still to do by hand:
    - Settings > Email in the admin: SMTP settings, then the test mail (docs/HEBERGEMENT.md section 6)
    - SSH keys only, fail2ban, automatic security updates (section 5.2): not touched by this script
    - a restore test (section 8.4) and an off-site copy (section 8.3, BACKUP_REMOTE)
    - an uptime probe outside this VM on https://$domain/api/health (section 9)

  Check the instance at any time with: $here/health.sh
SUMMARY
}

main() {
  parse_args "$@"
  resolve_config
  preflight
  if [ "$preflight_only" = 1 ]; then
    log "preflight passed for $domain; nothing was written"
    return 0
  fi
  [ "$docker_present" = 1 ] || install_docker_engine
  [ "$env_existed" = 1 ] || create_env
  prepare_directories
  configure_firewall
  start_stack
  wait_for_https
  install_backup_timer
  local code=0
  "$health" || code=$?
  [ "$code" -ne 2 ] || die "the instance is up but health.sh reports a failure" "$EXIT_NOT_HEALTHY"
  summary
}

main "$@"
