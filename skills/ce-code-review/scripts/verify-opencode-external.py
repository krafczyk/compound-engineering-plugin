#!/usr/bin/env python3
"""Verify an OpenCode external peer handoff against public routing output.

The helper fails closed unless source revisions and the selected role-instance
binding digest exactly match the host-owned comparison. On success it emits the
verified public resolution unchanged for the peer controller to consume.
"""

import json
import hashlib
import os
import re
import subprocess
import sys


def _fail(message):
    print(message, file=sys.stderr)
    raise SystemExit(4)


def _load(path):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            value = json.load(handle)
    except (OSError, ValueError) as exc:
        _fail("cannot read OpenCode external routing data: {}".format(exc))
    if not isinstance(value, dict):
        _fail("OpenCode external routing data must be an object")
    return value


def _resolve(cwd, instance, phase):
    script = os.path.join(os.path.dirname(os.path.realpath(__file__)), "ce-routing.py")
    instance_data = {"id": instance, "ordinal": 0}
    if phase is not None:
        instance_data["routing_phase"] = phase
    request = {
        "protocol": "ce-routing/v1",
        "op": "resolve_batch",
        "cwd": cwd,
        "host": {"harness": "opencode", "serving_family": "host-reported"},
        "intents": [],
        "roles": [{"role": "ce-code-review.adversarial-reviewer", "instance": instance_data}],
    }
    try:
        completed = subprocess.run(
            ["python3", "-I", "-S", script],
            cwd=cwd,
            input=json.dumps(request, separators=(",", ":")),
            text=True,
            capture_output=True,
            check=False,
            timeout=15,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        _fail("cannot resolve OpenCode external peer route: {}".format(exc))
    if completed.returncode != 0:
        _fail("OpenCode external public resolution failed: {}".format(completed.stderr[:500]))
    try:
        value = json.loads(completed.stdout)
    except ValueError:
        _fail("OpenCode external public resolution returned invalid JSON")
    if not isinstance(value, dict):
        _fail("OpenCode external public resolution must be an object")
    return value


def main():
    """Resolve and validate one host comparison, then emit the matched route."""
    if len(sys.argv) not in (4, 5):
        _fail("usage: verify-opencode-external.py EXPECTED CWD INSTANCE [fast-review]")
    expected = _load(sys.argv[1])
    cwd = os.path.realpath(sys.argv[2])
    instance = sys.argv[3]
    phase = sys.argv[4] if len(sys.argv) == 5 else None
    if not os.path.isabs(sys.argv[2]) or not os.path.isdir(cwd):
        _fail("OpenCode external cwd is invalid")
    if re.fullmatch(r"[A-Za-z0-9._-]{1,128}", instance) is None:
        _fail("OpenCode external instance is invalid")
    if phase not in (None, "fast-review"):
        _fail("OpenCode external routing phase is invalid")
    resolved = _resolve(cwd, instance, phase)
    role = "ce-code-review.adversarial-reviewer"

    if expected.get("protocol") != "ce-opencode-external-handoff/v1":
        _fail("OpenCode external comparison protocol is invalid")
    if expected.get("source_revisions") != resolved.get("snapshot", {}).get("source_revisions"):
        _fail("OpenCode external source revisions changed")

    bindings = expected.get("bindings")
    resolutions = resolved.get("resolutions")
    if not isinstance(bindings, list) or not isinstance(resolutions, list):
        _fail("OpenCode external comparison is malformed")
    expected_items = [item for item in bindings if isinstance(item, dict) and item.get("instance") == instance]
    resolved_items = [
        item for item in resolutions
        if isinstance(item, dict)
        and item.get("role") == role
        and isinstance(item.get("instance"), dict)
        and item["instance"].get("id") == instance
    ]
    if len(expected_items) != 1 or len(resolved_items) != 1:
        _fail("OpenCode external role instance does not match")
    resolution = resolved_items[0]
    digest_payload = {
        "role": resolution.get("role"),
        "class": resolution.get("class"),
        "instance": resolution.get("instance"),
        "binding": resolution.get("binding"),
    }
    canonical = json.dumps(digest_payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    computed_digest = "cebind-v1:" + hashlib.sha256(canonical.encode("ascii")).hexdigest()
    if resolution.get("binding_digest") != computed_digest:
        _fail("OpenCode external public binding digest is invalid")
    if expected_items[0].get("binding_digest") != computed_digest:
        _fail("OpenCode external binding changed")

    candidates = resolution.get("binding", {}).get("candidates")
    first = candidates[0] if isinstance(candidates, list) and candidates else None
    if not isinstance(first, dict) or first.get("kind") == "ce-default" or first.get("harness") == "opencode":
        _fail("OpenCode external comparison did not resolve an external first candidate")

    print(json.dumps(resolved, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
