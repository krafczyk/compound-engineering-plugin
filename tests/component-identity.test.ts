import { constants } from "fs"
import { copyFile, link, mkdtemp, mkdir, readFile, symlink, truncate, utimes, writeFile } from "fs/promises"
import path from "path"
import { afterEach, describe, expect, test } from "bun:test"
import {
  COMPONENT_IDENTITY_PROFILE,
  calculateComponentIdentity,
} from "../scripts/component-identity"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => Bun.$`rm -rf ${root}`.quiet()))
}, 20_000)

async function fixture(): Promise<string> {
  const scratch = "/tmp/opencode-mkchad/compound-engineering-component-identity"
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(path.join(scratch, "fixture-"))
  roots.push(root)
  const files: Record<string, string> = {
    "component.json": '{"schema":1}\n',
    "package.json": '{"name":"compound-engineering","version":"3.20.0"}\n',
    "plugin.json": '{"name":"compound-engineering","version":"3.20.0"}\n',
    ".claude-plugin/plugin.json": '{"name":"compound-engineering","version":"3.20.0"}\n',
    ".codex-plugin/plugin.json": '{"name":"compound-engineering","version":"3.20.0"}\n',
    ".cursor-plugin/plugin.json": '{"name":"compound-engineering","version":"3.20.0"}\n',
    ".devin-plugin/plugin.json": '{"name":"compound-engineering","version":"3.20.0"}\n',
    ".grok-plugin/plugin.json": '{"name":"compound-engineering","version":"3.20.0"}\n',
    ".kimi-plugin/plugin.json": '{"name":"compound-engineering","version":"3.20.0"}\n',
    ".opencode/package.json": '{"type":"module"}\n',
    ".opencode/plugins/compound-engineering.js": "export default {}\n",
    ".opencode/plugins/ce-routing-adapter.js": "export {}\n",
    ".opencode/plugins/ce-routing-host.py": "print('ok')\n",
    ".pi/extensions/compound-engineering.ts": "export {}\n",
    "skills/ce-test/SKILL.md": "---\nname: ce-test\n---\n",
    "skills/ce-test/references/ce-routing-protocol.json": '{"protocol":"ce-routing/v1"}\n',
  }
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  return root
}

async function digest(root: string) {
  const result = await calculateComponentIdentity(root)
  expect(result).toMatchObject({ ok: true, profile: "compound-engineering-plugin-v1" })
  if (!result.ok) throw new Error(result.error)
  return result.digest
}

describe("compound-engineering-plugin-v1 identity", () => {
  test("is stable across traversal order and timestamps", async () => {
    const first = await fixture()
    const second = await fixture()
    await writeFile(path.join(first, "skills/ce-test/a.txt"), "a")
    await writeFile(path.join(first, "skills/ce-test/z.txt"), "z")
    await writeFile(path.join(second, "skills/ce-test/z.txt"), "z")
    await writeFile(path.join(second, "skills/ce-test/a.txt"), "a")
    await utimes(path.join(second, "skills/ce-test/a.txt"), new Date(0), new Date(0))

    expect(await digest(first)).toBe(await digest(second))
  })

  test("distinguishes covered edits, additions, removals, and renames for equal-version installs", async () => {
    const installed = await fixture()
    const cached = await fixture()
    const baseline = await digest(installed)
    expect(baseline).toBe(await digest(cached))

    await writeFile(path.join(cached, "skills/ce-test/SKILL.md"), "changed")
    expect(await digest(cached)).not.toBe(baseline)
    await copyFile(path.join(installed, "skills/ce-test/SKILL.md"), path.join(cached, "skills/ce-test/SKILL.md"))
    await writeFile(path.join(cached, "skills/ce-test/references/ce-routing-protocol.json"), "changed")
    expect(await digest(cached)).not.toBe(baseline)
    await copyFile(
      path.join(installed, "skills/ce-test/references/ce-routing-protocol.json"),
      path.join(cached, "skills/ce-test/references/ce-routing-protocol.json"),
    )
    await writeFile(path.join(cached, "skills/ce-test/added.md"), "added")
    expect(await digest(cached)).not.toBe(baseline)
    await Bun.$`rm ${path.join(cached, "skills/ce-test/added.md")}`.quiet()
    await Bun.$`mv ${path.join(cached, "skills/ce-test/SKILL.md")} ${path.join(cached, "skills/ce-test/RENAMED.md")}`.quiet()
    expect(await digest(cached)).not.toBe(baseline)
  })

  test("excludes dependencies, VCS data, generated state, and root documentation", async () => {
    const root = await fixture()
    const baseline = await digest(root)
    for (const relative of [
      ".git/config",
      ".opencode/node_modules/example/index.js",
      ".context/run/state.json",
      "docs/notes.md",
      "README.md",
    ]) {
      const target = path.join(root, relative)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, "not runtime input")
    }
    expect(await digest(root)).toBe(baseline)
  })

  test("rejects unsafe paths and every profile limit", async () => {
    const cases: Array<{ name: string; prepare: (root: string) => Promise<void>; error: string }> = [
      {
        name: "symlink",
        prepare: async (root) => symlink("SKILL.md", path.join(root, "skills/ce-test/link.md")),
        error: "symlink",
      },
      {
        name: "special file",
        prepare: async (root) => {
          const target = path.join(root, "skills/ce-test/fifo")
          const proc = Bun.spawn(["mkfifo", target], { stdout: "ignore", stderr: "ignore" })
          expect(await proc.exited).toBe(0)
        },
        error: "special",
      },
      {
        name: "hard link",
        prepare: async (root) => link(
          path.join(root, "skills/ce-test/SKILL.md"),
          path.join(root, "skills/ce-test/hard-link.md"),
        ),
        error: "hardlink",
      },
      {
        name: "non-ASCII path",
        prepare: async (root) => writeFile(path.join(root, "skills/ce-test/cafe-é.md"), "x"),
        error: "path",
      },
      {
        name: "oversized file",
        prepare: async (root) => truncate(path.join(root, "skills/ce-test/SKILL.md"), COMPONENT_IDENTITY_PROFILE.max_per_file_bytes + 1),
        error: "file_bytes",
      },
      {
        name: "excessive entries",
        prepare: async (root) => {
          for (let index = 0; index < COMPONENT_IDENTITY_PROFILE.max_regular_files; index += 1) {
            await writeFile(path.join(root, "skills/ce-test", `entry-${index}.txt`), "")
          }
        },
        error: "regular_files",
      },
      {
        name: "excessive total bytes",
        prepare: async (root) => {
          const size = COMPONENT_IDENTITY_PROFILE.max_per_file_bytes
          const files = Math.floor(COMPONENT_IDENTITY_PROFILE.max_total_bytes / size) + 1
          for (let index = 0; index < files; index += 1) {
            const target = path.join(root, "skills/ce-test", `total-${index}.bin`)
            await writeFile(target, "")
            await truncate(target, size)
          }
        },
        error: "total_bytes",
      },
    ]

    for (const item of cases) {
      const root = await fixture()
      await item.prepare(root)
      await expect(calculateComponentIdentity(root)).resolves.toMatchObject({ ok: false, error: item.error })
    }
  }, 20_000)

  test("rejects changed-during-read and elapsed-time evidence", async () => {
    const root = await fixture()
    await expect(calculateComponentIdentity(root, {
      beforeRead: async (relative) => {
        if (relative === "skills/ce-test/SKILL.md") await writeFile(path.join(root, relative), "changed")
      },
    })).resolves.toMatchObject({ ok: false, error: "changed" })

    await expect(calculateComponentIdentity(root, {
      now: (() => {
        let value = 0
        return () => (value += COMPONENT_IDENTITY_PROFILE.max_elapsed_ms + 1)
      })(),
    })).resolves.toMatchObject({ ok: false, error: "elapsed" })
  })

  test("uses the declared fixed profile and no filesystem flags", () => {
    expect(COMPONENT_IDENTITY_PROFILE).toMatchObject({
      id: "compound-engineering-plugin-v1",
      algorithm: "sha256",
      framing: "path-u32be-content-u64be-v1",
    })
    expect(COMPONENT_IDENTITY_PROFILE.included_roots.every((root) => !root.startsWith("/") && !root.split("/").includes(".."))).toBe(true)
    expect(constants.O_NOFOLLOW).toBeDefined()
  })

  test("keeps the serialized owner profile in exact implementation parity", async () => {
    const component = JSON.parse(await readFile(path.join(import.meta.dir, "..", "component.json"), "utf8"))
    expect(component.schema).toBe(1)
    expect(component.component_id).toBe("compound-engineering")
    expect(component.relationships).toHaveLength(1)
    expect(Buffer.byteLength(JSON.stringify(component.relationships[0]))).toBeLessThanOrEqual(768)
    expect(component.identity_profile).toEqual(COMPONENT_IDENTITY_PROFILE)
  })

  test("produces a valid identity for the shipped runtime tree", async () => {
    const result = await calculateComponentIdentity(path.join(import.meta.dir, ".."))
    expect(result).toMatchObject({ ok: true, profile: "compound-engineering-plugin-v1" })
  })
})
