import { afterAll } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const testTempRoot = mkdtempSync(path.join(tmpdir(), "compound-engineering-test-"))

// Test modules create fixtures at import time, so redirect temp paths before they evaluate.
process.env.TMPDIR = testTempRoot
process.env.TMP = testTempRoot
process.env.TEMP = testTempRoot

afterAll(() => {
  rmSync(testTempRoot, { recursive: true, force: true })
})
