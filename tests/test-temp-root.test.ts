import { expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

test("test fixtures share one disposable per-run temp root", () => {
  const runRoot = tmpdir()

  expect(path.basename(runRoot)).toMatch(/^compound-engineering-test-/)
  expect(process.env.TMPDIR).toBe(runRoot)
  expect(process.env.TMP).toBe(runRoot)
  expect(process.env.TEMP).toBe(runRoot)

  const fixtureRoot = mkdtempSync(path.join(runRoot, "fixture-"))
  try {
    expect(path.dirname(fixtureRoot)).toBe(runRoot)
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
