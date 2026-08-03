# Phased Review Convergence

Load this reference at the caller-owned review/fix tail after the first configured review attempt. It defines only the opt-in two-phase loop; each caller retains its own finding eligibility, persistence, and residual behavior.

## Inputs And Evidence

1. Pin one merge base before the first attempt. Every round reviews the complete current diff against that same base and receives the same `plan:<path>` and `base:<ref>` scope.
2. First invoke `ce-code-review mode:agent review_phase:fast-if-configured` with that scope. Preserve each round's JSON, artifact path, run ID, phase, reviewed diff identity, findings, retained-fix evidence, and verification result.
3. Evaluate review status and the accumulated `blocking_route_failures` from both review and fixer waves before phase activation or any transition. Any unresolved required-route blocker stops the affected phase under its owning policy; it cannot enter the unavailable-review manual-scan fallback or residual handling. `failed`, `skipped`, or degraded-without-valid-coverage review never becomes green.
4. After that gate, when `review_phase.active` is false, immediately use the exact legacy one-pass review/fix/residual path with this first ordinary review result. Do not start an authoritative extra review.
5. A review may be green only when it completed with valid coverage and `blocking_route_failures` is empty. Preserve route evidence for every failure or policy-authorized fallback.

## Finding And Progress Rules

- Current blockers are finalized current P0/P1 findings, except preference-grade `settled_conflict`. `pre_existing_findings` never block. P2/P3 remain fixable or residual unless active instructions explicitly promote one.
- Apply the caller's existing eligible actionable findings. A retained fix at any priority, including P2/P3, invalidates the prior audit and requires a new complete-diff review in the same phase.
- Fingerprint every current blocker with normalized file + line bucket +/-3 + normalized title. Record each reviewed diff identity and the phase-local blocker fingerprint set; a previously seen phase/diff/fingerprint state is repeated.
- A retained diff directed at a current blocker with required verification passing is provisional progress and authorizes exactly one fresh review. On that review, the prior fix becomes material progress only if its blocker fingerprint cleared or concrete evidence shows that its failure scope narrowed; otherwise the phase stalls before another fix wave. A changed diff alone does not make an unchanged blocker productive. Changed process output, agent liveness, unrelated edits, or an unverified fix are not progress.
- Preserve every applied or skipped-fix reason, verification receipt, blocker fingerprint, reviewed diff identity, and transition reason. Never roll back retained fixes to escape a stall.

## State Transitions

| State | Condition after a valid review and its eligible fix wave | Next state |
| --- | --- | --- |
| Legacy | `review_phase.active` is false | Run the existing one-pass fix/residual behavior from the first review result; no authoritative phase. |
| Fast | No blockers and no retained fixes | Fast -> Authoritative: invoke fresh ordinary `ce-code-review mode:agent` on the complete diff. |
| Fast | No blockers, with any retained fix and no repeated state | Re-review the complete diff in Fast. |
| Fast | No blockers, with a retained fix and repeated state | Fast -> Authoritative: preserve fast evidence and invoke fresh ordinary `ce-code-review mode:agent`. |
| Fast | Blockers with verified provisional progress and no confirmed no-progress state | Re-review the complete diff in Fast. |
| Fast | Blockers without a current verified provisional fix, or repeated/confirmed no-progress state | Fast -> Authoritative: preserve fast evidence and invoke fresh ordinary `ce-code-review mode:agent`. |
| Fast | Review failed, skipped, or degraded without valid coverage and no required-route blocker | Fast -> Authoritative: preserve failure evidence and invoke fresh ordinary `ce-code-review mode:agent`. |
| Authoritative | No blockers and no retained fixes | Authoritative -> Green: run the caller's existing nonblocking residual handling. |
| Authoritative | No blockers, with any retained fix and no repeated state | Re-review the complete diff in Authoritative. |
| Authoritative | No blockers, with a retained fix and repeated state | Authoritative -> Blocked: stop with review, fixer, diff, and verification evidence. |
| Authoritative | Blockers with verified provisional progress and no confirmed no-progress state | Re-review the complete diff in Authoritative. |
| Authoritative | Blockers without a current verified provisional fix, or repeated/confirmed no-progress state | Authoritative -> Blocked: stop with review, fixer, diff, and verification evidence; never residualize blockers. |
| Authoritative | Review failed, skipped, or degraded without valid coverage and no required-route blocker | Authoritative -> Blocked: stop with review and route-failure evidence. |

There is no fixed productive-round cap. An interrupted run starts a new review from the current tree and pinned base; it does not replay prior fixes. Only authoritative green can enter residual handling. An attended caller may use its existing residual gate only after authoritative green; an autonomous caller never prompts.
