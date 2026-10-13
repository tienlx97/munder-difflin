# Office verification

Run `./harness/verify.sh` from app, or `./agent-office/harness/verify.sh` from LOG.
The runner writes bounded logs and a machine-readable summary under harness/runs.
A failing, interrupted, or changed-input run cannot pass. UI changes additionally
require `node tools/office-ui-review.cjs` after building; screenshots go to .local/evidence.

Runner, evidence writer and workflow helpers were copied from FE-P revision
ce1b9fe282de78a02bc4a0683b30994e3b15a22b (2026-10-13). Only the gate is replaced
with Electron/TypeScript/worker checks. FE-P remains the upstream source for
those helpers; compare updates deliberately rather than silently overwriting.
OpenSpec helpers remain available but are not required for office task intake.

The application's run verification executes each FE/BE repository's own gate
inside bubblewrap without provider credentials. Passing the gate enables user
acceptance; browser/task-specific evidence still needs review. A fresh fingerprint
is required at acceptance. This is local consistency evidence, not tamper-proof
attestation; installed dependencies and external services are outside the digest.
