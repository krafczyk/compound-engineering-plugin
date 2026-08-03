import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const read = (relativePath: string): Promise<string> =>
  readFile(path.join(process.cwd(), relativePath), "utf8")

describe("review convergence contract", () => {
  test("is byte-identical for ce-work and LFG", async () => {
    const [ceWork, lfg] = await Promise.all([
      read("skills/ce-work/references/review-convergence.md"),
      read("skills/lfg/references/review-convergence.md"),
    ])

    expect(lfg).toBe(ceWork)
  })

  test("defines the required phase transitions and evidence", async () => {
    const contract = await read("skills/ce-work/references/review-convergence.md")

    for (const token of [
      "review_phase:fast-if-configured",
      "legacy one-pass",
      "review_phase.active",
      "blocking_route_failures",
      "pre_existing_findings",
      "settled_conflict",
      "normalized file + line bucket +/-3 + normalized title",
      "reviewed diff identity",
      "required verification",
      "A changed diff alone does not make an unchanged blocker productive",
      "no fixed productive-round cap",
      "failed`, `skipped`, or degraded-without-valid-coverage",
      "Fast -> Authoritative",
      "Authoritative -> Blocked",
      "authoritative green",
    ]) expect(contract).toContain(token)

    const transitions = contract.split("\n")
      .filter((line) => /^\| (Legacy|Fast|Authoritative) \|/.test(line))
      .map((line) => line.split("|").slice(1, 4).map((cell) => cell.trim()))
    expect(transitions).toEqual([
      ["Legacy", "`review_phase.active` is false", "Run the existing one-pass fix/residual behavior from the first review result; no authoritative phase."],
      ["Fast", "No blockers and no retained fixes", "Fast -> Authoritative: invoke fresh ordinary `ce-code-review mode:agent` on the complete diff."],
      ["Fast", "No blockers, with any retained fix and no repeated state", "Re-review the complete diff in Fast."],
      ["Fast", "No blockers, with a retained fix and repeated state", "Fast -> Authoritative: preserve fast evidence and invoke fresh ordinary `ce-code-review mode:agent`."],
      ["Fast", "Blockers with verified provisional progress and no confirmed no-progress state", "Re-review the complete diff in Fast."],
      ["Fast", "Blockers without a current verified provisional fix, or repeated/confirmed no-progress state", "Fast -> Authoritative: preserve fast evidence and invoke fresh ordinary `ce-code-review mode:agent`."],
      ["Fast", "Review failed, skipped, or degraded without valid coverage and no required-route blocker", "Fast -> Authoritative: preserve failure evidence and invoke fresh ordinary `ce-code-review mode:agent`."],
      ["Authoritative", "No blockers and no retained fixes", "Authoritative -> Green: run the caller's existing nonblocking residual handling."],
      ["Authoritative", "No blockers, with any retained fix and no repeated state", "Re-review the complete diff in Authoritative."],
      ["Authoritative", "No blockers, with a retained fix and repeated state", "Authoritative -> Blocked: stop with review, fixer, diff, and verification evidence."],
      ["Authoritative", "Blockers with verified provisional progress and no confirmed no-progress state", "Re-review the complete diff in Authoritative."],
      ["Authoritative", "Blockers without a current verified provisional fix, or repeated/confirmed no-progress state", "Authoritative -> Blocked: stop with review, fixer, diff, and verification evidence; never residualize blockers."],
      ["Authoritative", "Review failed, skipped, or degraded without valid coverage and no required-route blocker", "Authoritative -> Blocked: stop with review and route-failure evidence."],
    ])
  })
})
