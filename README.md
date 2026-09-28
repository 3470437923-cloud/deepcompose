# writerD

**长篇中文小说 AI 写作工作台。** 桌面端应用（Tauri 2 + React 19 + TypeScript + Rust），作品以本地 Markdown 文件为唯一数据源，AI 通过工具调用直接读写作品目录。

- 版本：`2.0.1`　平台：Windows（WebView2）
- 产物：`release/writerD.exe`（免安装单文件），`npm run package` 一键重建
- 存储哲学：**格式优先**——用户改过的文档格式不被程序覆盖，回写只做追加与节内替换

## 能力

| 模块 | 说明 |
|---|---|
| 作品与章节 | 扫描/新建作品；维护文档 `小说资料\*.md`、章节 `章节内容\第N章.md`；中文/全角章号解析与数值排序 |
| 编辑器 | 多标签、未保存标记、`Ctrl+S` 保存、字数统计、面板开合与窗口尺寸记忆 |
| AI 对话 | 流式正文与思考渲染、工具调用行内展示、**停止生成（真中断上游连接）**、会话按日分组 |
| 工具调用 | `file_read` / `file_write` / `file_manage` / `create_project` / `question` / `skill_lookup`；写入前自动落快照 |
| 技能系统 | `SKILL.md` 三级渐进加载：元数据常驻 → 正文按需 `skill_lookup` → 配套资源用 `file_read` |
| 上下文压缩 | 超阈值把旧对话压成摘要，只影响发给模型的请求序列，**不删聊天记录** |
| 备忘录 | 单文件分类备忘录，可挂边常显 |
| 设置 | AI 提供商（OpenAI / Anthropic 双协议、模型自动检测）、参数、Skill、主题（三套液态玻璃主题 + 强调色 + 字号） |

## 快速开始

```powershell
npm.cmd install                 # 本机 PowerShell 下用 npm.cmd，不用 npm.ps1
npm.cmd run dev                 # 前端热更新（vite，端口 5183）
npm.cmd run tauri:dev           # 完整桌面端调试

npm.cmd run typecheck           # tsc --noEmit
npm.cmd test                    # vitest run
npm.cmd run package             # 打包：vite build → cargo build --release → 复制 → 刷新桌面快捷方式
```

更细的构建、验收与环境坑见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。

## 目录结构

```
writerD/
├─ src/
│  ├─ App.tsx                应用外壳（环境光壁纸 + 两屏切换 + 指针镜面反光）
│  ├─ core/                  核心层
│  │  ├─ app.ts dirs.ts fsbridge.ts ids.ts prefs.ts
│  │  ├─ ai/                 protocol agent controller prompt transport compress errors models
│  │  ├─ store/              project manifest markdown chapter snapshot session memo
│  │  ├─ skills/             registry scan
│  │  └─ tools/              spec exec pathGuard
│  ├─ ui/                    MainWorkbench / MemoModal / Dialogs / useMaximized
│  ├─ screens/               SettingsScreen（7 分页）
│  ├─ preview/               dev-only 浏览器预览沙箱（内存文件系统替身）
│  └─ styles/                tokens.css（主题令牌）/ glass.css（材质）/ app.css（布局）
├─ src-tauri/src/            sys.rs（目录与配置）fs.rs（文件桥）ai.rs（流式转发 + 中断）winstate.rs（窗口几何）
├─ tests/                    单元测试（vitest）
├─ tools/                    打包、截屏验收、e2e、预览取证脚本
├─ assets/builtin-skills/    内置技能
└─ release/writerD.exe       交付产物
```

## 磁盘格式契约（禁止改名）

下面这些名字是**已经落盘的既有格式**，改名会破坏用户已有作品与配置，属于兼容契约：

| 位置 | 名称 |
|---|---|
| 作品根 | `小说资料\`、`章节内容\`、`.openwrite_manifest.json`、`.openwrite_recycle\`、`recycle_manifest.json` |
| 作品根默认值 | `%USERPROFILE%\AI写小说` |
| 文档目录 | `writerd_sessions\`、`writerd_snapshots\`、`writerd_memos.json`、`skills\` |
| 配置 | `%APPDATA%\com.writerd\writerD\shared_preferences.json`（键名保留 `flutter.` 前缀） |
| 运行时状态 | `%APPDATA%\com.writerd\writerD\window_state.json`（窗口几何，可随时删除） |

配置模型是**封闭键集合**：商业化键（`vip_*` / `device_id`）读到也忽略、永不写出。新增配置键必须走 ADR 记录并同步 `src/core/prefs.ts`。

## 改代码前必读

1. **证据先行**：声称「完成/修复/通过」之前，必须拿出当场跑出的闸门输出。
2. **不臆造**：拿不到的数值/文案标 `[待实测]`，不要用常识补全。
3. **格式优先**：维护文档回写只做 `append` 与节内替换，禁止整体重写（`markdown.ts` 有回归锁）。
4. **写前快照**：任何回写先落快照（`snapshot.ts`）。
5. **路径分级**：作品根 / 技能根 / 作品目录三个授权根内直读，根外必须用户确认（`pathGuard.ts`）。
6. **密钥不入库**：API Key 只存在于运行时配置，绝不写进仓库、测试或提交。
7. **绝不用 PowerShell 写中文源码**：Windows PowerShell 5.1 按 GBK 解码 UTF-8，会吃掉后续字符、毁文件（本项目已发生过）。