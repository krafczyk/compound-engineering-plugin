# Review followup (LFG step 4–5)

`ce-code-review` is review-only. In the legacy branch, LFG applies eligible fixes itself, then commits. In configured phased convergence, LFG uses routed fixer subagents and retains the same eligibility and persistence bar.

## Step 5 — apply and persist review fixes

### What to apply

Apply a finding in the working tree only when **all** of the following hold:

1. **`suggested_fix` is present** — concrete change shape from the reviewer.
2. **`confidence` is `100`, or `75` with cross-persona agreement noted in the report** — do not apply anchor-50 findings.
3. **The fix is mechanical** — one coherent change, no contract/permission/security posture change, no new public API shape, no behavior change that needs product sign-off.
4. **Evidence still matches the code** at the cited `file:line` before editing.

Do not treat `autofix_class` as permission to auto-apply.

### What not to apply

- `autofix_class: manual` without a clear mechanical `suggested_fix`
- `autofix_class: advisory` — report-only
- `gated_auto` findings that change behavior, contracts, auth, or permissions
- Anything that needs a design conversation

### Execution

1. Filter `actionable_findings` (or markdown Actionable Findings) with the bar above.
2. Apply eligible fixes in the working tree in severity order (`#` stable from the review).
3. Run targeted tests when `requires_verification: true` on any applied finding.
4. If `git status --short` shows changes, stage only review-driven files, commit `fix(review): apply review findings`, and push before step 6 **when a remote is configured** (per LFG's shipping precondition). To push: if an upstream exists, run `git push`. If no upstream exists but a remote is configured (common on a fresh feature branch), resolve a writable remote dynamically: prefer `origin` when present, otherwise use `git remote` and choose the first configured remote. Then run `git push --set-upstream <remote> HEAD`. If there is no remote at all, do not push — the local commit suffices. If no eligible fixes were applied, note explicitly and skip commit.

### Configured phased convergence only

When the caller retained `convergence_enabled: true` from the first fast review, use this route for every fast and authoritative round even though ordinary authoritative results report `review_phase.active: false`. Retain the eligibility bar above, batch eligible findings by file, and use routed fix subagents. The orchestrator reviews each retained diff, runs the required targeted verification, commits and pushes with the same rules above, and returns which current blocker each retained diff addresses. When convergence was never enabled, the legacy inline path above remains unchanged.

**Routing batch: `lfg.review-fix-batches`.** After eligibility and file grouping fix the selected batches, before prompt assembly, load `references/execution-routing.md` and resolve one `lfg.review-fixer` request entry per selected batch in `ce-routing/v1` `resolve_batch`. Reuse the full frozen `parent_snapshot` envelope when one exists; include `parent_snapshot_id` only if it matches that envelope, never use ID-only live routing sources, and reuse the frozen binding on recovery; otherwise freeze the first snapshot. Routing cannot add a finding, weaken LFG's mechanical eligibility bar, or change the batch schedule.

<!-- ce-dispatch-site:lfg.review-fix-batches -->
Dispatch generic fixer subagents for the routed batches. Each confirms cited evidence, applies or skips assigned findings, does not re-run review, and returns applied/skipped `#`, changed files, verification evidence, and any unresolved required-route blocker with its redacted receipt. The orchestrator retains only reviewed changes, appends route blockers to convergence `blocking_route_failures`, and records the result for `references/review-convergence.md`; route blockers stop before residual handoff.

## Step 6 — residual handoff

Residuals are actionable findings **not** applied in step 5 — not leftovers from in-skill autofix. Use the Actionable Findings summary / artifact from step 4.
