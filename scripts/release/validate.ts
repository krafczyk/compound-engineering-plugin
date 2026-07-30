#!/usr/bin/env bun
import { execFileSync } from "node:child_process"
import path from "path"
import { COMPONENT_IDENTITY_PROFILE } from "../component-identity"
import { validateReleasePleaseConfig } from "../../src/release/config"
import { getCompoundEngineeringCounts, syncReleaseMetadata } from "../../src/release/metadata"
import { readJson } from "../../src/utils/files"

type ReleasePleaseManifest = Record<string, string>

type ComponentMetadata = {
  schema?: unknown
  component_id?: unknown
  component_version?: unknown
  relationships?: unknown
  identity_profile?: unknown
}

const MANIFEST_RELATIVE_PATH = ".github/.release-please-manifest.json"

// The release-as staleness check must compare a pin against the version already
// released on the base branch (main), NOT the working tree: a release-please PR
// bumps the working-tree manifest to the proposed version, which would make a
// legitimate pin look stale and block the very release it exists to create.
// Returns {} when origin/main is unreachable (e.g. a shallow checkout that did
// not fetch it) so the staleness check no-ops rather than risk a false block.
function readReleasedManifest(): ReleasePleaseManifest {
  try {
    const raw = execFileSync("git", ["show", `origin/main:${MANIFEST_RELATIVE_PATH}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return JSON.parse(raw) as ReleasePleaseManifest
  } catch {
    return {}
  }
}

const releasePleaseConfig = await readJson<{ packages: Record<string, unknown> }>(
  path.join(process.cwd(), ".github", "release-please-config.json"),
)
const manifest = await readJson<ReleasePleaseManifest>(
  path.join(process.cwd(), ...MANIFEST_RELATIVE_PATH.split("/")),
)
const [component, packageJson, pluginManifest, routingProtocol] = await Promise.all([
  readJson<ComponentMetadata>(path.join(process.cwd(), "component.json")),
  readJson<{ version?: unknown; dependencies?: Record<string, unknown> }>(path.join(process.cwd(), "package.json")),
  readJson<{ version?: unknown }>(path.join(process.cwd(), ".claude-plugin", "plugin.json")),
  readJson<{ opencode_tested_sdk_version?: unknown }>(path.join(process.cwd(), "scripts", "routing", "protocol-schema.json")),
])
const configErrors = validateReleasePleaseConfig(releasePleaseConfig, readReleasedManifest())
const componentErrors: string[] = []
if (component.schema !== 1 || component.component_id !== "compound-engineering") {
  componentErrors.push("component.json must declare schema 1 and component_id compound-engineering.")
}
if (component.component_version !== packageJson.version || component.component_version !== pluginManifest.version) {
  componentErrors.push("component.json component_version must match package.json and .claude-plugin/plugin.json versions.")
}
if (!Array.isArray(component.relationships) || component.relationships.length > 4) {
  componentErrors.push("component.json relationships must contain at most four declarations.")
} else {
  const relationship = component.relationships.find((item: any) => item?.id === "tested-opencode-sdk")
  if (
    !relationship
    || relationship.type !== "tested-with"
    || relationship.target_component !== "opencode"
    || relationship.contract?.kind !== "tested-baseline"
    || relationship.contract?.version !== routingProtocol.opencode_tested_sdk_version
    || relationship.contract?.version !== packageJson.dependencies?.["@opencode-ai/sdk"]
    || relationship.contract?.suffix_policy !== "literal"
  ) {
    componentErrors.push("component.json tested-opencode-sdk must match the routing SDK baseline with literal suffix policy.")
  }
  if (component.relationships.some((item) => Buffer.byteLength(JSON.stringify(item), "utf8") > 768)) {
    componentErrors.push("component.json relationships must each encode to at most 768 bytes.")
  }
}
if (JSON.stringify(component.identity_profile) !== JSON.stringify(COMPONENT_IDENTITY_PROFILE)) {
  componentErrors.push("component.json identity_profile must exactly match compound-engineering-plugin-v1.")
}
const rootExtraFiles = (releasePleaseConfig.packages["."] as { "extra-files"?: unknown[] } | undefined)?.["extra-files"]
if (!rootExtraFiles?.some((file: any) => file?.type === "json" && file?.path === "component.json" && file?.jsonpath === "$.component_version")) {
  componentErrors.push("release-please root extra-files must update component.json component_version.")
}
const counts = await getCompoundEngineeringCounts(process.cwd())
const result = await syncReleaseMetadata({
  write: false,
  componentVersions: {
    marketplace: manifest[".claude-plugin"],
    "cursor-marketplace": manifest[".cursor-plugin"],
  },
})
const changed = result.updates.filter((update) => update.changed)
const metadataErrors = result.errors

if (configErrors.length === 0 && componentErrors.length === 0 && changed.length === 0 && metadataErrors.length === 0) {
  console.log(
    `Release metadata is in sync. compound-engineering currently has ${counts.agents} agents, ${counts.skills} skills, and ${counts.mcpServers} MCP server${counts.mcpServers === 1 ? "" : "s"}.`,
  )
  process.exit(0)
}

if (configErrors.length > 0) {
  console.error("Release configuration errors detected:")
  for (const error of configErrors) {
    console.error(`- ${error}`)
  }
}

if (componentErrors.length > 0) {
  console.error("Component metadata errors detected:")
  for (const error of componentErrors) {
    console.error(`- ${error}`)
  }
}

if (metadataErrors.length > 0) {
  console.error("Release metadata structural errors detected:")
  for (const error of metadataErrors) {
    console.error(`- ${error}`)
  }
}

if (changed.length > 0) {
  console.error("Release metadata drift detected:")
  for (const update of changed) {
    console.error(`- ${update.path}`)
  }
  console.error(
    `Current compound-engineering counts: ${counts.agents} agents, ${counts.skills} skills, ${counts.mcpServers} MCP server${counts.mcpServers === 1 ? "" : "s"}.`,
  )
}
process.exit(1)
