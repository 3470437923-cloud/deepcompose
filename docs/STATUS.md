# writerD 状态（唯一进度真源）

> 每批工作结束更新本文：闸门实测数字、已完成、下一步。历史决策见 `docs/ADR/`。
> 契约（逐字文案与协议）见 `docs/CONTRACT.md`；实现级明细见 `docs/spec/`。

## 0. 交付物（用户要的结果）

| 产物 | 路径 | 状态 |
|---|---|---|
| 软件本体 | `S:\writerD\release\writerD.exe` | ✅ 已产出（2026-09-28 00:49，4.66 MB） |
| 桌面快捷方式 | `C:\Users\Administrator\Desktop\writerD.lnk` | ✅ 已建立（指向上面的 exe，同源图标） |
| 安装包 | `src-tauri\target\release\bundle\nsis\writerD_2.0.1_x64-setup.exe` | ⚠️ 为旧版，待交付前重出 |
| 一条命令重建 | `npm run package`（= `tools/package.ps1`） | ✅ 已跑通 |

## 1. 闸门（每次提交前必须全绿）

| 闸门 | 命令 | 当前实测 |
|---|---|---|
| TS 类型 | `.\node_modules\.bin\tsc.cmd --noEmit` | **exit 0** |
| 单元测试 | `.\node_modules\.bin\vitest.cmd run` | **11 passed / 1 file**（2026-09-28） |
| 前端构建 | `.\node_modules\.bin\vite.cmd build` | **成功**，dist 约 251 KB JS + 17 KB CSS |
| Rust 构建 | `cd src-tauri; cargo build --release` | **exit 0**（约 2 分钟） |
| 真机渲染 | `tools\capture.ps1` + 像素采样 | ✅ 标题栏 48px、三栏 220/1492/208 全部命中预期色值 |

> 渲染验收法（无头环境可用）：
> 1. 无头 Edge 探针（`msedge --headless=new --dump-dom`）量 DOM 盒模型；
> 2. `tools\capture.ps1` 截真窗 + `System.Drawing` 采样关键坐标色值。
> 两者都留实测输出，不靠"看起来对"。

## 2. 已完成

- **A 基座**
  - `docs/CONTRACT.md`（538 行，唯一接口真源）＋ 逆向证据库 `reference/`（30 文件）
  - Tauri 2 + React 19 + TS + Vite 骨架；`writerd.exe` 可跑
  - 版本控制（本仓库），`.gitignore` 排除 `node_modules/ dist/ src-tauri/target/`
- **B 界面基座（2 屏，机械转换自 `reference/ui-mock.html`）**
  - 主界面 + 设置屏；`tools/convert_mock.py` 可复现转换，且带"悬挂选择器碎片"守卫
  - 修复窗口空白缺陷（ADR-001）、接入用户 logo 与产品名（ADR-002）
- **C 数据层（起步）**
  - `src/core/fsbridge.ts`：文件系统桥（Tauri IPC ↔ 测试替身）
  - `src/core/dirs.ts`：目录权威（作品目录协议、应用数据、配置、回收站）
  - `src/core/ids.ts`：ID 与时间戳（逐字对齐真机格式）
  - `src/core/store/manifest.ts`：`.openwrite_manifest.json` 读写（含真机样本回归锁）
- **D 规格层**
  - `docs/spec/PREFS.md`：配置模型全键清单（43 键，含切除清单、AI 键、结构化键）
  - 更正 CONTRACT「442 键」为 43 键（ADR-003）

## 3. 下一步（按依赖排序）

1. **Rust 能力层**：`fs_*` 命令（读写/列举/改名/复制/删除/stat）、`app_dirs`、`prefs_load/save`
2. **数据层续**：作品扫描/新建/章节读写/维护文档回写（append + patchSection）/快照/回收站/备忘录
3. **界面接真数据**：目录树、标签页、编辑器、对话列表从真实作品目录读取
4. **AI 层**：双协议 provider + SSE 流式 + 工具调度循环（Rust 侧 reqwest 流式转发）
5. **工具层**：`file_read/file_write/file_manage/edit_file/ask_questions` + 路径分级三授权根
6. **技能系统**：SKILL.md 解析/CRUD/ZIP 导入导出/内置技能/三级渐进加载
7. **其余界面**：备忘录、起名、排版、外观、字体、用量、扫榜（可选）
8. **导出与同步**：docx(OOXML)/txt/md/epub、WebDAV、局域网 8917
9. **打包交付**：NSIS 安装包 + 快捷方式刷新（`npm run package`）

## 4. 真机基线（可复核的一手事实）

| 资产 | 路径 | 用途 |
|---|---|---|
| 已装 2.0.1 本体 | `S:\dsh\work\openwrite-201\exe\installed\OpenWrite.exe` | 行为与界面定标（可运行取截图） |
| 真实作品 | `C:\Users\Administrator\AI写小说\`（4 部 + `.openwrite_recycle`） | 目录协议与真实数据形态 |
| 真实会话 | `C:\Users\Administrator\Documents\openwrite_sessions\`（127 个） | 工具调用格式、thinking/text 结构 |
| 真实配置 | `%APPDATA%\com.openwrite\OpenWrite\shared_preferences.json` | 43 键权威值（已提取） |
| 内置技能 | `C:\Users\Administrator\Documents\skills\`（8 个） | 与 `assets/builtin-skills/` 同源 |
| 逆向索引 | `S:\dsh\openwrite-re\`（aotopsy 全量索引 + 重建方案 + 覆盖矩阵） | 机制与协议依据 |

## 5. 纪律（每批都要守）

1. **不创新**：有实证就照做，无实证标 `[待实测]`，不臆造。
2. **证据先行**：每个"完成"都要附当场实测输出；没有证据不算完成。
3. **格式优先**：维护文档回写只做 append / 节内局部替换，禁止整体重写、禁止恢复模板。
4. **写前快照**：任何回写先留快照可回滚。
5. **路径分级**：`projectRoot`/`skillsDir`/`booksRoot` 内直读，之外必须用户确认。
6. **不抄资产**：不复制对标软件的提示词原文、中文文案逐字照搬、图标、素材；机制照抄、文本原创。
7. **密钥不入库**：任何 key 不得写进文件、测试、提交。
