import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { lstat, open, readdir } from "node:fs/promises"
import path from "node:path"

export const COMPONENT_IDENTITY_PROFILE = {
  id: "compound-engineering-plugin-v1",
  algorithm: "sha256",
  included_roots: [
    "component.json",
    "package.json",
    "plugin.json",
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    ".cursor-plugin/plugin.json",
    ".devin-plugin/plugin.json",
    ".grok-plugin/plugin.json",
    ".kimi-plugin/plugin.json",
    ".opencode/plugins",
    ".pi/extensions",
    "skills",
  ],
  exclusions: [
    ".git",
    "node_modules",
    ".context",
    "__pycache__",
    "coverage",
    "tmp",
  ],
  max_regular_files: 4096,
  max_total_bytes: 16 * 1024 * 1024,
  max_per_file_bytes: 2 * 1024 * 1024,
  max_elapsed_ms: 5000,
  framing: "path-u32be-content-u64be-v1",
} as const

type IdentityError = "missing" | "path" | "symlink" | "hardlink" | "special" | "regular_files" | "file_bytes" | "total_bytes" | "changed" | "elapsed"

export type ComponentIdentityResult =
  | { ok: true; profile: typeof COMPONENT_IDENTITY_PROFILE.id; algorithm: "sha256"; digest: string; files: number; bytes: number }
  | { ok: false; profile: typeof COMPONENT_IDENTITY_PROFILE.id; error: IdentityError }

type Options = {
  now?: () => number
  beforeRead?: (relative: string) => Promise<void> | void
}

class DigestFailure extends Error {
  constructor(readonly code: IdentityError) {
    super(code)
  }
}

const noFollow = constants.O_NOFOLLOW ?? 0

function fail(code: IdentityError): never {
  throw new DigestFailure(code)
}

function stableStat(left: Awaited<ReturnType<typeof lstat>>, right: Awaited<ReturnType<typeof lstat>>): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
}

function canonicalRelative(root: string, target: string): string {
  const relative = path.relative(root, target).split(path.sep).join("/")
  if (
    relative === ""
    || relative.startsWith("../")
    || path.isAbsolute(relative)
    || relative.split("/").some((part) => part === "" || part === "." || part === "..")
    || !/^[\x21-\x7e]+$/.test(relative)
  ) fail("path")
  return relative
}

function excluded(relative: string): boolean {
  return relative.split("/").some((part) => COMPONENT_IDENTITY_PROFILE.exclusions.includes(part as never))
}

function checkDeadline(start: number, now: () => number): void {
  if (now() - start > COMPONENT_IDENTITY_PROFILE.max_elapsed_ms) fail("elapsed")
}

export async function calculateComponentIdentity(root: string, options: Options = {}): Promise<ComponentIdentityResult> {
  const now = options.now ?? Date.now
  const start = now()
  const absoluteRoot = path.resolve(root)
  const hash = createHash("sha256")
  const seen = new Set<string>()
  let fileCount = 0
  let totalBytes = 0

  const includeFile = async (target: string): Promise<void> => {
    checkDeadline(start, now)
    const relative = canonicalRelative(absoluteRoot, target)
    if (excluded(relative)) return
    const before = await lstat(target).catch(() => fail("missing"))
    if (before.isSymbolicLink()) fail("symlink")
    if (!before.isFile()) fail("special")
    if (before.nlink !== 1) fail("hardlink")
    if (before.size > COMPONENT_IDENTITY_PROFILE.max_per_file_bytes) fail("file_bytes")
    if (seen.has(relative)) fail("path")
    if (++fileCount > COMPONENT_IDENTITY_PROFILE.max_regular_files) fail("regular_files")
    totalBytes += before.size
    if (totalBytes > COMPONENT_IDENTITY_PROFILE.max_total_bytes) fail("total_bytes")

    await options.beforeRead?.(relative)
    checkDeadline(start, now)
    const handle = await open(target, constants.O_RDONLY | noFollow).catch(() => fail("changed"))
    try {
      const opened = await handle.stat()
      if (!opened.isFile() || !stableStat(before, opened)) fail("changed")
      const content = await handle.readFile()
      const after = await handle.stat()
      const named = await lstat(target).catch(() => fail("changed"))
      if (!stableStat(before, after) || !stableStat(before, named) || content.length !== before.size) fail("changed")
      checkDeadline(start, now)

      const pathBytes = Buffer.from(relative, "ascii")
      const pathLength = Buffer.alloc(4)
      pathLength.writeUInt32BE(pathBytes.length)
      const contentLength = Buffer.alloc(8)
      contentLength.writeBigUInt64BE(BigInt(content.length))
      hash.update(pathLength).update(pathBytes).update(contentLength).update(content)
      seen.add(relative)
    } finally {
      await handle.close()
    }
  }

  const walk = async (target: string): Promise<void> => {
    checkDeadline(start, now)
    const relative = canonicalRelative(absoluteRoot, target)
    if (excluded(relative)) return
    const before = await lstat(target).catch(() => fail("missing"))
    if (before.isSymbolicLink()) fail("symlink")
    if (before.isFile()) return includeFile(target)
    if (!before.isDirectory()) fail("special")

    const entries = await readdir(target)
    entries.sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")))
    for (const entry of entries) await walk(path.join(target, entry))
    const after = await lstat(target).catch(() => fail("changed"))
    if (!stableStat(before, after)) fail("changed")
  }

  try {
    for (const relative of COMPONENT_IDENTITY_PROFILE.included_roots) await walk(path.join(absoluteRoot, relative))
    checkDeadline(start, now)
    return {
      ok: true,
      profile: COMPONENT_IDENTITY_PROFILE.id,
      algorithm: COMPONENT_IDENTITY_PROFILE.algorithm,
      digest: hash.digest("hex"),
      files: fileCount,
      bytes: totalBytes,
    }
  } catch (error) {
    if (error instanceof DigestFailure) return { ok: false, profile: COMPONENT_IDENTITY_PROFILE.id, error: error.code }
    throw error
  }
}
