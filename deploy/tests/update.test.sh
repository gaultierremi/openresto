#!/usr/bin/env bash
# update.sh chooses between pulling and rebuilding from the registry name in .env: an install made
# with `install.sh --build` has images named localhost/openresto-*, which no registry serves, so
# it must rebuild from the checkout; every other install pulls. Run against stand-ins for docker
# and for backup.sh, in a scratch copy of deploy/: no Docker daemon, root or network needed.
#
#   deploy/tests/update.test.sh
# pass() cannot fail, so "A && pass || fail" below is a real if/else.
# shellcheck disable=SC2015,SC2016
set -Eeuo pipefail

src="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
passed=0; failed=0
pass() { passed=$((passed + 1)); printf 'PASS  %s\n' "$*"; }
fail() { failed=$((failed + 1)); printf 'FAIL  %s\n' "$*" >&2; }

cp -r "$src" "$work/deploy"
printf '#!/usr/bin/env bash\necho "backup" >> "$CALLS"\n' > "$work/deploy/backup/backup.sh"
mkdir -p "$work/bin"
cat > "$work/bin/docker" <<'SH'
#!/usr/bin/env bash
echo "docker $*" >> "$CALLS"
case "$*" in
  inspect*) echo healthy ;;
  *"ps -q backend"*) echo backend-id ;;
esac
exit 0
SH
chmod +x "$work/bin/docker"

run_update() { # registry
  : > "$work/calls"
  printf 'DOMAIN=resto.example.be\nOPENRESTO_VERSION=2.4.1\nOPENRESTO_REGISTRY=%s\nBACKUP_DIR=%s\n' "$1" "$work/backups" > "$work/env"
  env -i PATH="$work/bin:$PATH" HOME="$work" CALLS="$work/calls" ENV_FILE="$work/env" "$work/deploy/update.sh" >"$work/out" 2>&1
}

run_update localhost && code=0 || code=$?
[ "$code" = 0 ] && pass "built install: exit 0" || fail "built install: exit $code"
grep -qE 'docker-compose\.build\.yml build$' "$work/calls" && pass "built install: rebuilds with the build override" || fail "built install: no rebuild"
grep -q ' pull$' "$work/calls" && fail "built install: tried to pull localhost images" || pass "built install: never pulls"
grep ' up ' "$work/calls" | grep -q 'docker-compose.build.yml' && pass "built install: restarts with the same override" || fail "built install: restart without the override"
[ "$(grep -n '^backup' "$work/calls" | head -n 1 | cut -d: -f1)" = 1 ] && pass "built install: backs up before anything else" || fail "built install: backup was not first"

run_update ghcr.io/example && code=0 || code=$?
[ "$code" = 0 ] && pass "registry install: exit 0" || fail "registry install: exit $code"
grep -q ' pull$' "$work/calls" && pass "registry install: pulls" || fail "registry install: no pull"
grep -q ' build$' "$work/calls" && fail "registry install: built images" || pass "registry install: builds nothing"
grep -q 'docker-compose.build.yml' "$work/calls" && fail "registry install: layered the build override" || pass "registry install: no build override"

# A registry that is a Docker Hub namespace ("local") is refused before a backup, a pull or a build.
run_update local && code=0 || code=$?
[ "$code" != 0 ] && pass "namespace registry: refused" || fail "namespace registry: update ran"
grep -q 'Docker Hub namespace' "$work/out" && pass "namespace registry: says why" || fail "namespace registry: no explanation"
[ ! -s "$work/calls" ] && pass "namespace registry: nothing ran, not even the backup" || fail "namespace registry: ran $(wc -l < "$work/calls") command(s)"

echo
echo "passed: $passed  failed: $failed"
[ "$failed" -eq 0 ]
