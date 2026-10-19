import fs from "fs"
import path from "path"
import os from "os"
import { describe, expect, test } from "bun:test"
// @ts-expect-error -- plain JS plugin entrypoint, no type declarations
import { CompoundEngineeringPlugin } from "../.opencode/plugins/compound-engineering.js"
import { parseFrontmatter } from "../src/utils/frontmatter"

const skillsDir = path.resolve(import.meta.dir, "../skills")

type OpenCodeCommand = { template: string; description?: string }
type OpenCodeConfig = {
  skills?: { paths?: string[] }
  command?: Record<string, OpenCodeCommand>
}

async function applyPlugin(config: OpenCodeConfig = {}): Promise<OpenCodeConfig> {
  const plugin = await CompoundEngineeringPlugin()
  await plugin.config(config)
  return config
}

// The plugin ships a dependency-free regex parser because the OpenCode runtime loads
// it as plain JS; this oracle uses the repo's js-yaml parser so the two disagree if
// the regex one drifts.
const skills = fs
  .readdirSync(skillsDir)
  .filter((entry) => fs.existsSync(path.join(skillsDir, entry, "SKILL.md")))
  .map((dir) => {
    const raw = fs.readFileSync(path.join(skillsDir, dir, "SKILL.md"), "utf8")
    const { data } = parseFrontmatter(raw, `${dir}/SKILL.md`)
    return {
      dir,
      name: data.name as string,
      description: data.description as string | undefined,
      suppressed: data["user-invocable"] === false || data["user-invocable"] === "false",
    }
  })

const expectedTemplate = (name: string) => `Load and execute the \`${name}\` skill.\n\n$ARGUMENTS`

describe("opencode plugin skill commands", () => {
  test("explicit runtime root supplies routing and shell scratch without changing model settings", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ce-plugin-runtime-"))
    try {
      const plugin = await CompoundEngineeringPlugin({
        serverUrl: new URL("http://127.0.0.1:4096"), directory: process.cwd(),
      }, { runtimeRoot: root })
      const output = { env: { UNRELATED: "preserved" } }
      await plugin["shell.env"]({}, output)
      expect(output.env).toEqual({ UNRELATED: "preserved", CE_ROUTING_STATE_ROOT: root,
        TMPDIR: root, TMP: root, TEMP: root })
      const config = { model: "unchanged/model", command: {} }
      await plugin.config(config)
      expect(config.model).toBe("unchanged/model")
      await expect(CompoundEngineeringPlugin({}, { runtimeRoot: "relative" })).rejects.toThrow(/absolute/)
      fs.chmodSync(root, 0o755)
      await expect(CompoundEngineeringPlugin({}, { runtimeRoot: root })).rejects.toThrow(/private/)
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  })

  test("registers a command for every user-invocable skill", async () => {
    const config = await applyPlugin()
    const expected = skills
      .filter((skill) => !skill.suppressed)
      .map((skill) => skill.name)
      .sort()

    expect(Object.keys(config.command ?? {}).sort()).toEqual(expected)
  })

  test("each command carries a $ARGUMENTS template and the skill description", async () => {
    const config = await applyPlugin()
    for (const skill of skills) {
      const command = config.command?.[skill.name]
      if (skill.suppressed) {
        expect(command).toBeUndefined()
        continue
      }
      expect(command?.template).toBe(expectedTemplate(skill.name))
      expect(command?.description).toBe(skill.description)
    }
  })

  // additionalProperties: false in the opencode config schema -- an unknown key
  // here is a config validation error, not an ignored field.
  test("commands use only keys the opencode config schema allows", async () => {
    const allowed = new Set(["template", "description", "agent", "model", "variant", "subtask"])
    const config = await applyPlugin()
    for (const command of Object.values(config.command ?? {})) {
      for (const key of Object.keys(command)) {
        expect(allowed.has(key)).toBe(true)
      }
    }
  })

  test("does not clobber a user-defined command of the same name", async () => {
    const mine: OpenCodeCommand = { template: "my own ce-plan wrapper" }
    const config = await applyPlugin({ command: { "ce-plan": mine } })

    expect(config.command?.["ce-plan"]).toBe(mine)
    expect(config.command?.["ce-debug"]?.template).toBe(expectedTemplate("ce-debug"))
  })

  test("registers the skills directory once, preserving existing paths", async () => {
    const config = await applyPlugin({ skills: { paths: ["/somewhere/else"] } })
    await applyPlugin(config)

    expect(config.skills?.paths).toEqual(["/somewhere/else", skillsDir])
  })

  test("native package registers the OpenCode-owned routed task adapter", async () => {
    const plugin = await CompoundEngineeringPlugin({
      serverUrl: new URL("http://127.0.0.1:4096"),
      directory: process.cwd(),
    })

    expect(plugin.tool?.ce_task).toBeDefined()
    expect(plugin.tool?.ce_task.description).toMatch(/OpenCode routing boundary/i)
    expect(plugin.event).toBeDefined()
    await plugin.event?.({
      event: { type: "session.deleted", properties: { info: { id: "deleted-session" } } },
    })
    await plugin.event?.({
      event: { type: "session.idle", properties: { sessionID: "idle-session" } },
    })
  })

  // Guards the frontmatter-scoped parse: a whole-file `name:` match could pick up
  // a line from a fenced YAML example and register a command with no skill behind it.
  test("every registered command name is a skill directory name", async () => {
    const config = await applyPlugin()
    const dirs = new Set(skills.map((skill) => skill.dir))
    for (const name of Object.keys(config.command ?? {})) {
      expect(dirs.has(name)).toBe(true)
    }
  })
})
