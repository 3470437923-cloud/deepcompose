# 第三方许可正文的来源与生成边界

本轮许可材料覆盖锁文件中的 **5 个 npm 生产依赖、466 个 Cargo registry 包和 2 组本地字体，共 473 个组件**。Rust 范围是整个锁文件的保守超集，包含其他平台及构建、开发依赖；它不声称这些包都会进入每个二进制。计数随锁文件改变，生成器实际输出为准。

[THIRD-PARTY-NOTICES.txt](../THIRD-PARTY-NOTICES.txt) 是分发正文集合；[sources.json](../assets/third-party-licenses/sources.json) 是补件的版本、URL、文件 SHA-256 和选择许可的机器可读清单。每个组件都有独立段落，保留原始许可文本、版权声明、包声明的作者及仓库信息。包元数据明确标作元数据，不将 authors 字段改写成版权归属。

## 重复生成与验证

使用 Python 3.11+（本次使用捆绑 Python 3.12）：

```sh
npm ci
cargo fetch --locked --manifest-path src-tauri/Cargo.toml
python3 tools/collect-notices.py
python3 tools/collect-notices.py --check
python3 tools/collect-notices.py --self-test
```

[生成器](../tools/collect-notices.py) 只读取本地 node_modules、Cargo registry 和本仓库补件，生成过程不联网。它递归查找 LICENSE/LICENCE/COPYING/COPYRIGHT/NOTICE/UNLICENSE/AUTHORS 和 licenses 目录，并识别含正文的根目录 README，以及 Cargo 声明的 license-file。COPYING.rs 等同名源码、SPDX 文件和 JSON 元数据不能单独充当正文。原有版权、附加 NOTICE 和完整 AUTHORS 仍随许可保留。正文识别使用最小长度及已知许可条款措辞，是缺件防线，不是法律文本完整性证明。

缺安装依赖、锁定版本不匹配、无可识别正文、声明的 license-file 缺失、补件缺失或 SHA-256 不符，均返回非零，并列出具体组件；失败不覆盖既有成果。补件 crate 的提交和仓库路径与包内 .cargo_vcs_info.json 再次核对。--check 重新组装完整内容，逐字节比较当前成果；同时正文头部记录两份锁文件和补件来源清单的 SHA-256。修改锁文件、补件或本地许可后必须重跑。--self-test 在独立临时目录验证缺正文、SPDX-only、递归路径、重复生成、陈旧内容、哈希错误、丢失补件及失败时不覆盖成果。

## 原 37 个缺件的处理

原脚本只找包根目录，曾报告 37 个 crate 缺正文。复核后，r-efi 5.3.0、6.0.0 的包内 AUTHORS 实际包含完整 MIT 许可及版权人清单，现直接保留。其余 **35 个 crate** 补件来自官方仓库；另发现 npm @tauri-apps/plugin-dialog 2.8.0 只有 SPDX 文件，也增加了补件。因此机器清单有 **36 个组件映射、23 个补充原文或版本证据文件**。

| 组件 / 版本 | 来源和处理 |
| --- | --- |
| alloc-stdlib 0.3.0 | [dropbox/rust-alloc-no-stdlib](https://github.com/dropbox/rust-alloc-no-stdlib)，包内提交对应的根 LICENSE，保留 BSD-3-Clause 正文和 Dropbox 版权。 |
| block2 0.6.2；dispatch2 0.3.1；objc2 0.6.4；objc2-encode 4.1.0；objc2-exception-helper 0.1.1；14 个 objc2 framework crate 0.3.2 | [madsmtm/objc2](https://github.com/madsmtm/objc2)，分别保存包内精确提交的 LICENSE.md，及其明确链接的 [OSI MIT 原文](https://opensource.org/license/MIT)。具体 crate 名、版本、提交及仓库路径逐项列在 sources.json。对提供许可选择的包选 MIT。 |
| defmt-parser 1.0.0 | [knurling-rs/defmt](https://github.com/knurling-rs/defmt)，精确提交根 LICENSE-MIT。 |
| dlopen2 0.8.2；dlopen2_derive 0.4.3 | [OpenByteDev/dlopen2](https://github.com/OpenByteDev/dlopen2)，精确提交根 LICENSE。 |
| jni-sys-macros 0.4.1 | [jni-rs/jni-sys](https://github.com/jni-rs/jni-sys)，精确提交根 LICENSE-MIT。 |
| libappindicator-sys 0.9.0 | [tauri-apps/libappindicator-rs](https://github.com/tauri-apps/libappindicator-rs)，精确提交根 LICENSE-MIT；该包 Cargo.toml 缺 repository，仓库证据来自包内 CHANGELOG.md 的官方提交链接，提交由 .cargo_vcs_info.json 提供。 |
| ndk 0.9.0；ndk-sys 0.6.0+11769913 | [rust-mobile/ndk](https://github.com/rust-mobile/ndk)，精确提交根 LICENSE-MIT。 |
| ndk-context 0.1.1 | [rust-windowing/android-ndk-rs](https://github.com/rust-windowing/android-ndk-rs)，精确提交根 LICENSE-MIT。 |
| selectors 0.38.0 | [servo/stylo](https://github.com/servo/stylo)，精确提交 selectors/lib.rs 的原始 MPL 声明及完整原文件，附 [Mozilla 官方 MPL-2.0 正文](https://www.mozilla.org/media/MPL/2.0/index.txt)。 |
| tauri-plugin 2.7.0 | [tauri-apps/tauri](https://github.com/tauri-apps/tauri)，精确提交根 LICENSE-MIT。 |
| webview2-com 0.39.1；webview2-com-sys 0.39.1；webview2-com-macros 0.8.1 | [wravery/webview2-rs](https://github.com/wravery/webview2-rs)，各包精确提交根 LICENSE。 |
| winapi-i686-pc-windows-gnu 0.4.0；winapi-x86_64-pc-windows-gnu 0.4.0 | [retep998/winapi-rs 的 0.3.9 标签](https://github.com/retep998/winapi-rs/tree/0.3.9)，解析到不可变提交 796a8e6c2971dc2ff1bcff166e6671284f9b5b6b，各自 i686/x86_64 目录内 LICENSE-MIT。旧包没有 .cargo_vcs_info.json；保存该提交对应 Cargo.toml，明确目标包版本均为 0.4.0。这是上游对应版本证据，不冒称由旧 crate 提供发布提交。 |
| npm @tauri-apps/plugin-dialog 2.8.0 | [tauri-apps/plugins-workspace](https://github.com/tauri-apps/plugins-workspace)，同版本 Rust 包的 VCS 提交 a2364a5f216324439feedeb25b2db74e7b1eba90，保存 plugins/dialog/LICENSE_MIT 和 package.json；后者确认 npm 包名称及 2.8.0 版本。 |

MIT OR Apache-2.0、MIT/Apache-2.0 或其他含 MIT 的可选许可，补件选择 MIT，并在机器清单记录 selected_license。已有包内其他许可原文照样保留。r-efi 的 AUTHORS 也提供完整 MIT 选择。此选择避免把未随附的所有 OR 分支都假称为已经完整附录。

## 必须保留的上游边界

objc2 官方 LICENSE.md 不是 MIT 正文，单独保存它不够。因此同时保存其链接的 OSI MIT 完整许可段落，去除网页 HTML 并解码实体；该转换在机器清单 extraction 字段说明。官方模板中的 Copyright <YEAR> <COPYRIGHT HOLDER> 保持原样，**它是模板占位符，不是本项目对版权人或年份的断言**。没有把 Cargo authors 字段或推测出的贡献者填入模板。上游 LICENSE.md 没有提供独立版权行，收集材料如实保留这种情况。

更重要的是，objc2 原文明确表示，这些 crate 通常由 Apple SDK 自动派生，并对派生作品分发许可存在疑问；原文包含 [Xcode 许可链接](https://www.apple.com/legal/sla/docs/xcode.pdf)，现完整保留。这里完成了正文和来源的收集，**并没有消除该上游许可不确定性**。

selectors 的 MPL-2.0 可执行形式分发有对应源代码可获得性要求；这份正文集合本身不是源码交付、修改标记或发布合规的证明。Cargo crate 可能包含其他 vendored 源码和数据，独立源码头、动态系统库、WebView/SDK、各平台实际链接产物和安装器也可能有额外义务。生成器递归保留显式许可文件，但不宣称已审计每一行源代码的归属或全部最终安装包。本轮不得据此宣称“全许可法律审计完成”。
