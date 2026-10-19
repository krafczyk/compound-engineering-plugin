# Installing Compound Engineering for OpenCode

Add Compound Engineering to the `plugin` array in your global or project `opencode.json`:

```json
{
  "plugin": ["compound-engineering@git+https://github.com/EveryInc/compound-engineering-plugin.git"]
}
```

Restart OpenCode after changing the config. The OpenCode plugin registers the Compound Engineering skills directory and the host-owned `ce_task_prepare`/`ce_task` routing adapter directly; no Bun installer or generated skill copy is required. Its fixed package-owned Python wrapper imports canonical routing semantics without exposing host operations through generated skill resolvers. The adapter freezes each selected wave behind a process-local opaque handle and rejects duplicate preparation for the same turn/role/instance. Lost handles are not rehydrated. Configured external CE Work routes stay on CE Work's durable controller path and are accepted only after independent public config resolution matches the plugin's non-authoritative comparison identifiers. Omission blocks based on the parsed OpenCode host identity. Mixed native-to-external continuation blocks rather than skipping or reordering candidates. Converter-produced OpenCode skill trees do not include this native adapter or comparison handoff, so configured OpenCode selectors and OpenCode-origin external execution fail closed rather than claiming they ran.

To pin a release, add a tag. Replace `X.Y.Z` with the release you want — see the [releases page](https://github.com/EveryInc/compound-engineering-plugin/releases) for available tags:

```json
{
  "plugin": ["compound-engineering@git+https://github.com/EveryInc/compound-engineering-plugin.git#compound-engineering-vX.Y.Z"]
}
```

## Local Development

From this checkout, point OpenCode at the package path:

```json
{
  "plugin": ["/path/to/compound-engineering-plugin"]
}
```

Restart OpenCode after changing the package source.
## Runtime storage and failure diagnostics

The plugin accepts an optional `runtimeRoot` in its OpenCode plugin tuple:

```json
["file:///absolute/path/to/compound-engineering/.opencode/plugins/compound-engineering.js",
 {"runtimeRoot": "/absolute/private/ce-runtime"}]
```

Create the directory beforehand, owned by the current user with mode0700, using
its canonical nonsymlink path. Invalid roots fail before dispatch. This option
places routing locks/authentication state and private task scratch beneath that
root. Child shell commands inherit the stable `CE_ROUTING_STATE_ROOT` and their
own task-specific `TMPDIR`/`TMP`/`TEMP`; parent commands use the configured root.
Restart OpenCode after changing plugin configuration. Existing routing state in
the former root is not moved or deleted; resume only with a fresh preparation.

Standalone bundled diagnostics use the same root when launched with
`CE_ROUTING_STATE_ROOT=/absolute/private/ce-runtime`. Keep it stable across
concurrent invocations: a per-command temporary root cannot coordinate shared
configuration locks or snapshot authentication. Without an override, Python
routing retains its historical effective-user `/tmp` root and task scratch uses
the host OS temporary directory.

Terminal provider errors remain failed, consumed attempts. Error output includes
only allowlisted error classifications, HTTP status and retryability, when
available. Provider messages, response bodies, headers and prompts are omitted.
These diagnostics do not change routing, retry permissions or provider safeguards.
