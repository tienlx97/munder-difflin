#!/usr/bin/env bash
# Sourced by verify.sh; cwd is the repository root.
for command in node timeout flock; do
  command -v "$command" >/dev/null || { echo "Required tool missing: $command" >&2; exit 1; }
done
STEP_TIMEOUT_SECONDS=${HARNESS_STEP_TIMEOUT_SECONDS:-600}
if ! [[ "$STEP_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  echo 'HARNESS_STEP_TIMEOUT_SECONDS must be a positive integer' >&2
  exit 1
fi
mkdir -p harness/runs || exit 1
# Kernel lock is released even after a crash; do not delete the lock file.
exec 9>harness/runs/.verify.lock
flock -n 9 || { echo 'Another verification is running in this checkout.' >&2; exit 1; }
RUN_DIR=$(mktemp -d "harness/runs/$(date +%Y%m%d-%H%M%S)-XXXXXX") || exit 1
export RUN_DIR
node harness/lib/evidence.mjs start || exit 1
fail=0
finish() {
  local status=$?
  trap - EXIT
  if [ "$status" -eq 0 ] && [ "$fail" -ne 0 ]; then status=1; fi
  node harness/lib/evidence.mjs finish "$status" || status=1
  if [ "$status" -eq 0 ]; then
    echo "VERIFICATION PASSED — task may be marked done. Evidence: $RUN_DIR/"
  else
    echo "VERIFICATION FAILED — the task is NOT done. Evidence: $RUN_DIR/"
  fi
  exit "$status"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
step() {
  local name="$1"; shift
  local started=$SECONDS status=0
  echo "──► $name"
  node harness/lib/evidence.mjs step-start "$name" || exit 1
  timeout --kill-after=10s "${STEP_TIMEOUT_SECONDS}s" "$@" >"$RUN_DIR/$name.log" 2>&1 || status=$?
  node harness/lib/evidence.mjs step "$name" "$status" "$((SECONDS-started))" || exit 1
  if [ "$status" -eq 0 ]; then
    echo "    ✔ $name ($((SECONDS-started))s)"
  else
    echo "    ✘ $name FAILED (exit $status) — see $RUN_DIR/$name.log"
    if [ "$status" -eq 124 ]; then echo "    Time limit: ${STEP_TIMEOUT_SECONDS}s"; fi
    tail -n 20 "$RUN_DIR/$name.log" | sed 's/^/      /'
    fail=1
  fi
  return "$status"
}
has_pkg_script() {
  node -e 'const p=require("./package.json"); process.exit(p.scripts?.[process.argv[1]] ? 0 : 1)' "$1"
}
require_step() {
  local name="$1" script="$2"
  if has_pkg_script "$script"; then
    step "$name" pnpm run "$script"
  else
    step "$name" bash -c 'echo "Required package script missing: $1" >&2; exit 1' _ "$script"
  fi
}
