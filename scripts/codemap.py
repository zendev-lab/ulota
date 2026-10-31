#!/usr/bin/env python3
"""Build/check a source-backed code atlas without third-party packages."""

import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/codemap"
PUBLIC = ROOT / "apps/spark-docs/public/codemap"


def read(path):
    return json.loads((ROOT / path).read_text())


def safe_file(path):
    full = (ROOT / path).resolve()
    assert full.is_relative_to(ROOT) and full.is_file(), f"Missing/unsafe path: {path}"
    return full


def project(data):
    data["baseline"] = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    inventory = read("architecture/packages.json")["packages"]
    owners = {p: n["id"] for n in data["nodes"] for p in n["packages"]}
    assert len(owners) == sum(len(n["packages"]) for n in data["nodes"])
    assert set(owners) == set(inventory), (
        "Package inventory changed; review ownership groups"
    )
    tracked = (
        subprocess.check_output(
            ["git", "ls-files", "--cached", "-z"],
            cwd=ROOT,
        )
        .decode()
        .split("\0")
    )
    tracked = sorted(
        p
        for p in tracked
        if p
        and (ROOT / p).is_file()
        and not p.startswith(("docs/codemap/", "apps/spark-docs/public/codemap/"))
    )
    generated_edges = {}
    for node in data["nodes"]:
        prefixes = [inventory[p]["path"] + "/" for p in node["packages"]]
        files = [p for p in tracked if any(p.startswith(prefix) for prefix in prefixes)]
        if node["id"] == "daemon":
            files = [
                p for p in files if not p.startswith("apps/spark-daemon/src/store/")
            ]
        elif node["id"] == "daemon-store":
            files = [p for p in tracked if p.startswith("apps/spark-daemon/src/store/")]
        elif node["id"] == "tooling":
            files = [
                p for p in tracked if not p.startswith(("apps/", "packages/", "docs/"))
            ]
        elif node["id"] == "external":
            files = node["evidence"][:]
        node["files"] = sorted(set(files))
        node["testFiles"] = [
            p for p in files if re.search(r"(?:\.test\.[cm]?[jt]s$|/tests/.*\.rs$)", p)
        ]
        tests = []
        # Index representative literal test declarations; no test execution is implied.
        for path in node["testFiles"]:
            for line, text in enumerate(safe_file(path).read_text().splitlines(), 1):
                match = re.search(r"\b(?:it|test)\(\s*([\"\'])(.*?)\1\s*,", text)
                if match:
                    tests.append(
                        {
                            "path": path,
                            "line": line,
                            "symbol": match[2],
                            "declaration": text.strip(),
                        }
                    )
                    break
            if len(tests) == 8:
                break
        node["tests"] = tests
        node["externalDependencies"] = []
        node["packageMetadata"] = []
        for name in node["packages"]:
            meta = inventory[name]
            manifest = meta["path"] + "/package.json"
            node["packageMetadata"].append({"name": name, **meta})
            for dep, version in read(manifest).get("dependencies", {}).items():
                if dep in owners:
                    target = owners[dep]
                    if target == node["id"]:
                        continue
                    key = (node["id"], target)
                    edge = generated_edges.setdefault(
                        key,
                        {
                            "id": "build-" + "-".join(key),
                            "source": key[0],
                            "target": key[1],
                            "kind": "dependency",
                            "label": "Production package dependencies; not runtime calls.",
                            "evidence": [],
                            "packages": [],
                        },
                    )
                    edge["evidence"].append(manifest)
                    edge["packages"].append(
                        {"from": name, "to": dep, "version": version}
                    )
                else:
                    node["externalDependencies"].append(
                        {"name": dep, "version": version, "manifest": manifest}
                    )
    for edge in generated_edges.values():
        edge["evidence"] = sorted(set(edge["evidence"]))
    data["edges"] = [e for e in data["edges"] if e["kind"] != "dependency"] + sorted(
        generated_edges.values(), key=lambda e: e["id"]
    )
    baseline_files = set(
        subprocess.check_output(
            ["git", "ls-tree", "-r", "--name-only", data["baseline"]],
            cwd=ROOT,
            text=True,
        ).splitlines()
    )
    displayed = {p for node in data["nodes"] for p in node["files"] + node["evidence"]}
    displayed.update(t["path"] for node in data["nodes"] for t in node["tests"])
    displayed.update(p for edge in data["edges"] for p in edge["evidence"])
    displayed.update(
        p for flow in data["flows"] for step in flow["steps"] for p in step["evidence"]
    )
    data["baselineMissingPaths"] = sorted(displayed - baseline_files)
    return data


def validate(data):
    ids = [n["id"] for n in data["nodes"]]
    assert ids and len(ids) == len(set(ids))
    assert data["flows"]
    assert len({e["id"] for e in data["edges"]}) == len(data["edges"])
    refs = {
        "architecture/packages.json",
        "pnpm-lock.yaml",
        "Cargo.lock",
        "Cargo.toml",
        "package.json",
    }
    for node in data["nodes"]:
        assert node["role"] and node["impact"] and node["evidence"]
        refs.update(node["files"] + node["evidence"])
        for test in node["tests"]:
            lines = safe_file(test["path"]).read_text().splitlines()
            assert lines[test["line"] - 1].strip() == test["declaration"], test
            assert test["symbol"] in test["declaration"], test
    for edge in data["edges"]:
        assert edge["source"] in ids and edge["target"] in ids and edge["evidence"]
        assert edge["kind"] in ("dependency", "dataflow")
        refs.update(edge["evidence"])
    assert len({f["id"] for f in data["flows"]}) == len(data["flows"])
    for flow in data["flows"]:
        assert flow["command"] and flow["steps"]
        for step in flow["steps"]:
            assert step["node"] in ids and step["description"] and step["evidence"]
            refs.update(step["evidence"])
    for path in refs:
        safe_file(path)
    subprocess.run(
        ["git", "cat-file", "-e", data["baseline"] + "^{commit}"], cwd=ROOT, check=True
    )
    return refs


def html(data):
    payload = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
    return (OUT / "template.html").read_text().replace("__MAP_DATA__", payload)


def main():
    mode = sys.argv[1] if len(sys.argv) == 2 else ""
    if mode not in ("build", "check"):
        raise SystemExit("Usage: python3 scripts/codemap.py build|check")
    data = project(read("docs/codemap/map.json"))
    validate(data)
    if mode == "build":
        PUBLIC.mkdir(parents=True, exist_ok=True)
        (PUBLIC / "codemap.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        (PUBLIC / "codemap.html").write_text(html(data))
    print(
        f"Validated {len(data['nodes'])} nodes, {len(data['edges'])} edges and {len(data['flows'])} flows; all inventory packages are assigned and source references resolve."
    )


if __name__ == "__main__":
    main()
