#!/usr/bin/env bash
# Linux 原生打包入口；--check 仅验证前端，可在其它宿主运行。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
MODE="${1:-build}"
if [ "$#" -gt 1 ]; then
    echo "只接受一个参数：--check / --preflight / --help" >&2
    exit 2
fi
case "$MODE" in
    -h|--help)
        echo "用法：bash tools/package-linux.sh [--check|--preflight]"
        echo "默认：Linux 原生构建 deb；--check：仅类型检查与前端构建；--preflight：仅 Linux 依赖预检。"
        exit 0 ;;
    build|--check|--preflight) ;;
    *) echo "未知参数：$MODE" >&2; exit 2 ;;
esac

if [ "$MODE" != --check ]; then
    if [ "$(uname -s)" != Linux ]; then
        echo "Linux 打包必须在 Linux 运行；当前宿主：$(uname -s)。--check 不能替代 Linux 编译或真机验收。" >&2
        exit 2
    fi
    for tool in node npm cargo rustc cc pkg-config dpkg-deb; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            echo "缺少工具：$tool；请按 docs/LINUX.md 安装依赖。" >&2
            exit 1
        fi
    done
    for lib in gtk+-3.0 webkit2gtk-4.1 libsoup-3.0; do
        if ! pkg-config --exists "$lib"; then
            echo "缺少开发库：$lib；请按 docs/LINUX.md 安装依赖。" >&2
            exit 1
        fi
        echo "$lib $(pkg-config --modversion "$lib")"
    done
    # 只接受宿主 GNU 目标，避免误把 macOS/musl 或其它架构称作原生 Linux 产物。
    HOST="$(rustc -vV | sed -n 's/^host: //p')"
    case "$HOST" in
        x86_64-unknown-linux-gnu|aarch64-unknown-linux-gnu) ;;
        *) echo "暂未支持的原生构建目标：$HOST" >&2; exit 2 ;;
    esac
    echo "Linux 原生目标：$HOST"
    if [ "$MODE" = --preflight ]; then exit 0; fi
fi

for tool in tsc vite tauri; do
    if [ ! -x "$ROOT/node_modules/.bin/$tool" ]; then
        echo "缺少本地构建工具：$tool；请先 npm ci。" >&2
        exit 1
    fi
done
if [ "$MODE" = --check ]; then
    "$ROOT/node_modules/.bin/tsc" --noEmit
    "$ROOT/node_modules/.bin/vite" build
    echo "前端检查通过；未编译 Linux Rust、未打包、未运行 WebKitGTK。"
    exit 0
fi

# Tauri 自动合并 tauri.linux.conf.json；beforeBuildCommand 负责类型检查与前端构建。
# 显式宿主 target 也避免 Cargo 全局配置将构建重定向到其它平台。
"$ROOT/node_modules/.bin/tauri" build --target "$HOST" --bundles deb
TARGET_DIR="$(cargo metadata --no-deps --format-version 1 --manifest-path src-tauri/Cargo.toml | node -e 'let s=""; process.stdin.on("data", d => s += d); process.stdin.on("end", () => console.log(JSON.parse(s).target_directory));')"
echo "deb 输出目录：$TARGET_DIR/$HOST/release/bundle/deb"
echo "打包完成；安装、首次启动与 X11/Wayland 验收须在 Linux 桌面继续执行。"
