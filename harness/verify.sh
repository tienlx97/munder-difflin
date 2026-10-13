#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
source harness/lib/runner.sh
step typecheck npm run typecheck
step office-tests node --test test/coding-office-policy.test.cjs test/office-evidence.test.cjs test/office-lifecycle.test.cjs
step worker-tests python3 ../scripts/test-office-worker.py
step worker-resilience python3 ../scripts/test-office-resilience.py
step verification-isolation python3 ../scripts/test-office-verification.py
step build npm run build
