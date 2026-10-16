#!/usr/bin/env python3
"""按锁文件收集许可原文；缺来源、正文或补件即失败。Python 3.11+，生成时不联网。"""
from pathlib import Path
import hashlib
import json
import os
import sys
import tomllib

ROOT = Path(__file__).resolve().parents[1]
SUPPLEMENTS = Path("assets/third-party-licenses")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def notice_files(directory):
    result = []
    for child in directory.rglob("*"):
        name = child.name.upper()
        # 递归保留内嵌许可，排除同名源码和只含标识符的 SPDX 元数据。
        if child.is_file() and child.suffix.lower() not in (".rs", ".spdx", ".json") and (
            name.startswith(("LICENSE", "LICENCE", "COPYING", "COPYRIGHT", "NOTICE", "UNLICENSE", "AUTHORS"))
            or any(part.upper() in ("LICENSES", "LICENCES") for part in child.relative_to(directory).parts[:-1])
        ):
            result.append(child)
    # README 中可能有完整许可；纯链接或标识符不能当正文。
    for child in directory.glob("*[Rr][Ee][Aa][Dd][Mm][Ee]*"):
        if child.is_file() and has_terms(child.read_text(encoding="utf-8")):
            result.append(child)
    return sorted(set(result))


def has_terms(text):
    normalized = " ".join(text.lower().split())
    return len(normalized) >= 500 and any(term in normalized for term in (
        "permission is hereby granted", "redistribution and use", "apache license",
        "mozilla public license version", "sil open font license", "unicode license",
        "permission to use", "permission is granted to anyone",
        "community data license agreement - permissive",
        "this is free and unencumbered", "creative commons",
        "gnu lesser general public license", "gnu general public license",
        "授权", "许可协议",
    ))


def main():
    locks = ("package-lock.json", "src-tauri/Cargo.lock")
    sections = ["DeepCompose — Third-party license texts\n\n"
        "Generated from npm production dependencies and ALL registry packages in Cargo.lock.\n"
        "This conservative cross-platform superset includes Rust build/dev dependencies.\n"
        "Original texts and copyright notices follow; SPDX labels do not replace terms.\n"
        "This collection is not a complete legal or bundled-source audit.\n"
        "See docs/LICENSE-SOURCES.md for evidence and upstream Apple SDK caveats.\n"
        + "".join(f"SHA256 {rel}: {sha256(ROOT / rel)}\n" for rel in locks)
        + f"SHA256 {SUPPLEMENTS.as_posix()}/sources.json: {sha256(ROOT / SUPPLEMENTS / 'sources.json')}\n"]
    missing = []
    count = 0
    sources = json.loads((ROOT / SUPPLEMENTS / "sources.json").read_text(encoding="utf-8"))
    supplements = {entry["component"]: entry for entry in sources["components"]}
    if len(supplements) != len(sources["components"]):
        raise ValueError("duplicate supplemental component")

    def collect(label, directory, extra=(), metadata=None):
        nonlocal count
        files = notice_files(directory)
        for p in extra:
            if not p.is_file():
                missing.append(label + ": declared license-file missing: " + p.name)
            elif p not in files:
                files.append(p)
        texts = [(str(p.relative_to(directory)), p.read_text(encoding="utf-8")) for p in files]
        supplement = supplements.get(label)
        if supplement:
            for rel in supplement["files"]:
                spec = sources["files"][rel]
                path = ROOT / SUPPLEMENTS / rel
                if not path.resolve().is_relative_to((ROOT / SUPPLEMENTS).resolve()):
                    raise ValueError("supplement path escapes assets: " + rel)
                if not path.is_file():
                    missing.append(label + ": supplemental file missing: " + rel)
                    continue
                if not spec.get("url", "").startswith("https://") or sha256(path) != spec["sha256"]:
                    missing.append(label + ": supplemental provenance/hash mismatch: " + rel)
                    continue
                texts.append((str(SUPPLEMENTS / rel) + "\nSource: " + spec["url"], path.read_text(encoding="utf-8")))
        if not any(has_terms(text) for _, text in texts):
            missing.append(label + ": no complete license body (identifier/notice alone is insufficient)")
            return
        sections.append("\n" + "=" * 72 + "\n" + label + "\n")
        if metadata:
            sections.append("Package metadata (not a copyright assertion): " + json.dumps(metadata, ensure_ascii=False, sort_keys=True) + "\n")
        if supplement:
            sections.append("Supplemental source: " + json.dumps(supplement, ensure_ascii=False, sort_keys=True) + "\n")
        for name, text in sorted(texts):
            sections.append("\n--- " + name + " ---\n" + text + "\n")
        count += 1

    lock = json.loads((ROOT / locks[0]).read_text(encoding="utf-8"))
    for rel, pkg in sorted(lock["packages"].items()):
        if not rel or pkg.get("dev") or pkg.get("devOptional"):
            continue
        directory = ROOT / rel
        if not directory.is_dir():
            missing.append(rel + ": run npm ci")
            continue
        installed = json.loads((directory / "package.json").read_text(encoding="utf-8"))
        if installed.get("version") != pkg["version"]:
            missing.append(rel + ": installed version differs from lock; run npm ci")
            continue
        collect("npm " + rel + "@" + pkg["version"], directory,
                metadata={key: installed[key] for key in ("license", "author", "authors", "repository") if key in installed})

    cargo = tomllib.loads((ROOT / locks[1]).read_text(encoding="utf-8"))
    registry = Path(os.environ.get("CARGO_HOME", Path.home() / ".cargo")) / "registry/src"
    for pkg in sorted(cargo["package"], key=lambda p: (p["name"], p["version"])):
        if not pkg.get("source", "").startswith("registry+"):
            if "source" in pkg:
                missing.append(pkg["name"] + ": non-registry source requires manual review")
            continue
        label = "crate " + pkg["name"] + "@" + pkg["version"]
        candidates = sorted(registry.glob("*/" + pkg["name"] + "-" + pkg["version"]))
        if not candidates:
            missing.append(label + ": run cargo fetch --locked")
            continue
        directory = candidates[0]
        manifest = tomllib.loads((directory / "Cargo.toml").read_text(encoding="utf-8"))["package"]
        if (manifest["name"], manifest["version"]) != (pkg["name"], pkg["version"]):
            missing.append(label + ": registry manifest does not match lock")
            continue
        supplement = supplements.get(label)
        vcs_file = directory / ".cargo_vcs_info.json"
        if supplement and vcs_file.is_file():
            vcs = json.loads(vcs_file.read_text(encoding="utf-8"))
            if vcs["git"]["sha1"] != supplement["commit"] or vcs.get("path_in_vcs", "") != supplement["path_in_vcs"]:
                missing.append(label + ": upstream supplemental commit/path differs from packaged VCS evidence")
        license_file = manifest.get("license-file")
        collect(label, directory, [directory / license_file] if license_file else [],
                metadata={**{key: manifest[key] for key in ("license", "authors", "repository") if key in manifest},
                          "source": pkg["source"], "checksum": pkg["checksum"]})

    for rel in ("src/assets/fonts/inter", "src/assets/fonts/misans"):
        collect("asset " + rel, ROOT / rel)
    if missing:
        print("Incomplete notices; no output written:", file=sys.stderr)
        print("\n".join(missing), file=sys.stderr)
        return 1
    output = ROOT / "THIRD-PARTY-NOTICES.txt"
    content = "\n".join(sections)
    if "--check" in sys.argv:
        if not output.is_file() or output.read_bytes() != content.encode("utf-8"):
            print("Notices missing or stale; regenerate with tools/collect-notices.py", file=sys.stderr)
            return 1
        print(f"Verified {count} components; notices are current")
    else:
        output.write_bytes(content.encode("utf-8"))
        print(f"Collected {count} components into {output.name} ({output.stat().st_size} bytes)")
    return 0


def self_test():
    """隔离临时目录验证缺件不会写出/覆盖成果；不修改项目或 registry。"""
    import contextlib
    import io
    import tempfile
    from unittest.mock import patch

    original_root = ROOT
    fixture = (ROOT / SUPPLEMENTS / "authorities/OSI-MIT.txt").read_text(encoding="utf-8")
    with tempfile.TemporaryDirectory(prefix="deepcompose-notices-") as temporary:
        root = Path(temporary)
        registry = root / "cargo/registry/src/test/example-1.0.0"
        registry.mkdir(parents=True)
        (registry / "Cargo.toml").write_text('[package]\nname = "example"\nversion = "1.0.0"\nlicense = "MIT"\n')
        (root / "src-tauri").mkdir()
        (root / "src-tauri/Cargo.lock").write_text('[[package]]\nname = "example"\nversion = "1.0.0"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "test"\n')
        (root / "package-lock.json").write_text('{"packages": {}}')
        for rel in ("src/assets/fonts/inter", "src/assets/fonts/misans"):
            directory = root / rel
            directory.mkdir(parents=True)
            (directory / "LICENSE").write_text(fixture)
        (root / SUPPLEMENTS).mkdir(parents=True)
        index = root / SUPPLEMENTS / "sources.json"
        index.write_text('{"components": [], "files": {}}')
        output = root / "THIRD-PARTY-NOTICES.txt"
        output.write_text("existing output")
        globals()["ROOT"] = root
        try:
            with patch.dict(os.environ, {"CARGO_HOME": str(root / "cargo")}), patch.object(sys, "argv", ["collect-notices.py"]):
                def run():
                    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                        return main()
                assert run() == 1 and output.read_text() == "existing output"
                (registry / "LICENSE.spdx").write_text("SPDX-License-Identifier: MIT")
                assert run() == 1 and output.read_text() == "existing output"
                (registry / "src").mkdir()
                (registry / "src/LICENSE").write_text(fixture)
                assert run() == 0
                first = output.read_bytes()
                assert run() == 0 and output.read_bytes() == first
                with patch.object(sys, "argv", ["collect-notices.py", "--check"]):
                    assert run() == 0
                    output.write_text("stale")
                    assert run() == 1 and output.read_text() == "stale"
                body = root / SUPPLEMENTS / "MIT.txt"
                body.write_text(fixture)
                index.write_text(json.dumps({"components": [{"component": "crate example@1.0.0", "files": ["MIT.txt"]}],
                    "files": {"MIT.txt": {"url": "https://opensource.org/license/MIT", "sha256": sha256(body)}}}))
                assert run() == 0
                first = output.read_bytes()
                body.write_text("tampered")
                assert run() == 1 and output.read_bytes() == first
                # 已验证绝对临时路径，只移除自测刚创建的单个文件。
                body.unlink()
                assert run() == 1 and output.read_bytes() == first
        finally:
            globals()["ROOT"] = original_root
    print("Notice self-check passed: missing body, SPDX-only, nested text, repeatability, freshness, hash mismatch, missing supplement")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(self_test() if "--self-test" in sys.argv else main())
    except (OSError, ValueError, KeyError) as error:
        print(f"Incomplete notices; no output written: {error}", file=sys.stderr)
        raise SystemExit(1)
