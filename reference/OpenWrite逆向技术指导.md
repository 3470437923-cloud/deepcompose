# OpenWrite v2.0.1 逆向分析与技术复刻指导

> 样本：`OpenWrite-v2.0.1-android-arm64.apk`（31.3 MB）与 `OpenWrite-win-x64-Setup-v2.0.1.exe`（13.1 MB）
> 分析日期：2026-09-26 ｜ 分析方式：纯静态（innoextract/innounp 解包、apktool 3.0.2、jadx 1.5.5、自研字符串提取）
> 范围声明：仅覆盖**本地功能**的技术栈与实现要点；会员体系、支付（faka）、Skill 广场等后端只做接口面描述，不涉及绕过。

---

## 1. 总体结论：一套 Flutter 代码，双端同源

两个安装包**不是两种技术栈**，而是同一个 Flutter (Dart) 工程的两种构建产物：

| 端 | 载体 | 核心业务代码位置 | 大小 |
|---|---|---|---|
| Android | APK，包名 `com.openwrite.app`，versionCode 2031 | `lib/arm64-v8a/libapp.so`（Dart AOT 快照） | 11.5 MB |
| Windows | Inno Setup 6.7.0 安装包 → `{app}\OpenWrite.exe` + `flutter_windows.dll` | `{app}\data\app.so`（Dart AOT 快照） | 13.1 MB |

- Java/Kotlin 层**极薄**：APK 里 `com.openwrite.app` 下只有两个类——`MainActivity`（继承 `FlutterActivity`）和 `R.java`。MainActivity 只注册了一个自定义 MethodChannel `com.openwrite.app/updater`，方法 `installApk(path)`：通过 FileProvider 调起系统安装器实现**应用内自更新**。
- Windows 端插件 DLL：`audioplayers_windows`、`desktop_drop`、`permission_handler_windows`、`screen_retriever_windows`、`url_launcher_windows`、`window_manager`。
- Android 端插件（smali 目录实证）：`path_provider`、`shared_preferences`、`url_launcher`、`flutter_plugin_android_lifecycle`、`flutter_foreground_task`（pravera，前台服务+开机自启）、ML Kit 条码扫描（`libbarhopper_v3.so`，用于**扫码识别文字/配对二维码**）。
- 字符串实证还用到：`package_info_plus`（`dev.fluttercommunity.plus/package_info`）、共享偏好（`plugins.flutter.io/shared_preferences`）。

**复刻路径因此非常直接：一个 Flutter 3 工程，写好 Dart 业务层，配同一组插件，即可同时出 Android 和 Windows 双端。**

---

## 2. 应用定位

OpenWrite 写作助手 = **AI 小说写作工作台**，本地功能全景（全部由界面文案与内部符号实证）：

1. **小说项目管理**：多项目，目录结构 `小说资料/世界观.md`、`小说资料/人物库.md`、`小说资料/章节摘要.md`、`章节内容/`；章节按 `第N章 标题` 格式识别；支持 txt/md/docx 导入（含“作家助手格式 docx”）、TXT/Word 导出、按章节选择导出。
2. **AI 对话/写作引擎**：多会话、消息回撤（“回撤到此”）、三路对比（同时生成 3 个 AI 回复择优）、上下文自动压缩（超阈值把旧对话压缩成摘要、完整记录本地保留）、自定义系统提示词、温度/最大输出/上下文窗口参数、思考过程展开/收起、停止生成。
3. **Skill 系统（类 Claude Skills）**：技能 = 一个目录，含 `SKILL.md`（frontmatter + 正文 ≤500 行、≤50KB）+ `scripts/`（可执行脚本）+ `references/`（按需加载资料）+ `assets/`（输出资源）；渐进式加载避免撑爆上下文；开启的 Skill 注入系统提示词（约 100 字始终在）；内置技能不可删，修改内置技能自动克隆为用户副本；支持 zip 导入/导出（含校验：必含 SKILL.md、拒绝符号链接、重复路径、超限）；技能创建助手（question 工具交互式收集：做什么→何时触发→输出格式→约束）。
4. **内置 Skill（从提示词文本实证）**：章节大纲/剧情分析、写作风格蒸馏（上传小说→提炼风格指南→生成可复用风格 Skill，带防复述校验与重试）、代码审查助手、小说拆解、维护文档同步。
5. **AI 工具调用（function calling）**：文件读写/列目录/追加文件、终端命令（仅电脑端，高危命令需确认：删文件、改权限、改注册表、格式化、fork 炸弹等提示词级拦截+确认机制）、网页搜索（AnySearch，注册后每日 1000 次免费）、网文扫榜（番茄/起点榜单数据，`/api/qidian/*` `/api/rank*`）、question 交互提问工具；工具白名单（始终允许的目录）、外部路径读取确认。
6. **备忘录**：分类管理、合并、批量操作。
7. **起名工具**：男性名字/女性名字/门派名称/功法名称/法宝名称/兵器名称/体质名称，批量生成+复制。
8. **回收站**：小说/文件移入回收站、还原（重名自动改名）、清空、禁止嵌套移入。
9. **一键排版**：去空格、压缩空行、首行缩进、标点替换规则。
10. **灵感碰撞**、**抽卡模式**、**审稿质检**、**小说拆解**（搜索网文或上传 TXT ≤500 万字，AI 逐章分析生成大纲+剧情分析，最多 20 章）。
11. **扫描文字**（Android，ML Kit 文字识别）。

---

## 3. AI 接入层（本地部分）

支持多提供商配置（名称/地址/Key/模型，多配置切换），字符串实证的接入点：

- **OpenAI 格式**：`https://api.openai.com/v1/chat/completions`，自定义地址自动拼接 `/v1/chat/completions`
- **Anthropic 格式**：`https://api.anthropic.com/v1/messages`、`https://api.deepseek.com/anthropic(/messages)`，自动拼接 `/v1/messages` 或 `/messages（无 v1）`
- **聚合网关**：`https://api.kilo.ai/api/openrouter(/models)`、`https://opencode.ai/zen/v1(/models)`、`https://newapi.openxz.cn(/api/pricing)`
- **公益模型**：免费模型列表 + 排除关键词过滤（`get_model_filter_keywords`）
- **联网搜索**：`https://api.anysearch.com`（Key 制）

内置模型名样本：`deepseek-v4(-flash)`、`glm-5.2/5.3`、`gpt-5~5.5(-pro)`、`claude-opus-4-7/4-8`、`qwen3.6-plus/qwen3.8` 等。

工程要点：SSE 流式接收（“连接中断，正在重试”“秒未收到任何数据”判活）、错误码分类提示（401 Key 无效/过期、403 无权限、429 算力紧张、上下文超限、响应中断）、单模型测试连接、自动填 Key（官方套餐场景）。

---

## 4. 本地数据存储模型（复刻核心）

内部符号实证的数据实体（`openwrite_*` 前缀）：

```
openwrite_manifest          # 全局清单（项目/技能索引）
openwrite_meta              # 元数据
openwrite_sessions          # 聊天会话记录
openwrite_snapshots         # 文件操作快照（会话记录及文件操作快照，支持“回撤到此”）
openwrite_recycle/          # 回收站
openwrite_memos             # 备忘录
openwrite_skill_metadata    # Skill 元数据（含广场安装来源标记）
openwrite_notification      # 通知中心
openwrite_terminal(_*)      # 终端相关
openwrite_phone             # 手机同步/配对
```

- 配置走 `shared_preferences`（`flutter.*` 键）；文件型数据（小说、Skill、备忘录、会话）以**文件目录**形式存放（支持用户自定义存储目录、迁移、恢复默认目录），而非数据库——证据：大量“目录不存在/迁移数据/压缩包”文案，且无 sqflite/isar 实体表名。
- **备份/同步单位 = zip 包**：`projects.zip`、`sessions.zip`、`skills.zip`、`memos.zip`（外加谜之 `dece.zip`）。
- **WebDAV 云同步**：坚果云 `https://dav.jianguoyun.com/dav/`，只传有改动的内容；退出时自动同步可选；上传/下载按四类 zip 分包；大小限制（单分类过大警告、3MB/50KB 等阈值）。
- **局域网同步（手机⇄电脑）**：HTTP 服务监听 `8917` 端口，路径前缀 `/OpenWrite/`；手机扫码读取配对信息（二维码，ML Kit 扫码）；电脑端“手动立即打包一份”放入共享区，手机发起拉取；通知“手机同步内容已到达电脑”。
- **会话快照/回撤**：会话有文件操作快照，“回撤到此”把该消息之后对话删除并把消息回填输入框；已被其他改动覆盖的快照跳过还原。

---

## 5. 字体与外观系统

内置开源字体（按需下载，jsdelivr/npmmirror/GitHub 三源回退，npm 包 `openwrite-fonts@1.0.0`）：

- 思源宋体 `SourceHanSerifCN-Regular.otf`（正式排版）
- 霞鹜文楷 `LXGWWenKai-Regular.ttf`（屏幕长文阅读）
- 悠哉 `Yozai-Regular.ttf`、小赖 `Xiaolai-Regular.ttf`（网文阅读）
- ChillKai（Klee One 改造手写体）、Iansui、SmileySans-Oblique（窄斜黑体，标题封面）

外观：深浅色主题/跟随系统、强调色自定义、聊天与编辑器字号分别调节、全窗口自定义背景图+毛玻璃通透度滑杆、自定义完成提示音（默认 `assets/sounds/notification_default.mp3`）、字体注册进系统。

---

## 6. 更新与安全机制（本地侧）

- **自更新**：`?action=check_update` → 下载新包（多服务器回退：openxz.cn / 103.126.101.8 / 111.170.163.42）→ **SHA256 校验**（不匹配则取消）→ Windows 启动安装器 / Android 走 `installApk` channel。
- **心跳/公告/反馈**：`?action=heartbeat`、`announcement`、`feedback`。
- **内容安全**：发送前敏感词检查（“内容包含敏感词”）、Skill/脚本执行前的安全审查（AI 安全审查助手，JSON 输出）、诊断日志。
- **终端沙箱**：风险命令需用户确认，白名单目录机制，项目外路径读取需确认。

---

## 7. 后端接口面（仅登记，不含破解）

- 主 API：`https://openxz.cn/api/index.php?action=...`（announcement / app_config / check_update / feedback / heartbeat / get_model_filter_keywords / marketplace_upload / marketplace_download / marketplace_update_skill）
- 支付发卡：`https://pay.openxz.cn/faka/api_{products,create_order,order_status,vip,phone_keys}.php`（支付宝扫码，手机号找回）
- 扫榜数据：`/api/qidian/{categories,ranks,rank_top,rank_names,rank_count}`、`/api/{books,categories,count,dates,stats,top,...}`、`/api/usage/token/`
- 会员：手机号绑定、最多 3 台设备、套餐（含模型额度 Key）与 VIP（仅解锁功能）双轨。

---

## 8. 复刻技术清单（shopping list）

**框架**：Flutter 3.x（stable，一套代码出 Android+Windows）

**Dart/Flutter 依赖**（按证据推断的 pub 包）：
```
path_provider, shared_preferences, url_launcher, package_info_plus
flutter_foreground_task          # Android 前台服务/保活
mobile_scanner 或 mlkit 条码/文字识别  # 扫码配对、扫描文字
audioplayers / audioplayers_windows  # 提示音
desktop_drop                     # Windows 拖拽导入文件
window_manager + screen_retriever    # 窗口管理
permission_handler               # 存储/相机权限
http/dio + SSE 客户端            # 流式 AI 对话
archive                          # zip 打包/解包（同步与 Skill 导入导出）
webdav_client 或自实现           # 坚果云同步
docx 解析（archive + xml 自实现，证据：内嵌 OOXML schema 字符串）# docx 导入导出
```

**Android 原生层**：只需复制样本的 `MainActivity`（installApk channel）+ FileProvider 配置。

**Windows 打包**：Inno Setup 6.x 脚本（样本的 `install_script.iss` 即模板，AppMutex 单实例、自启动图标、装后运行）。

**关键工程量排序**：
1. AI 流式对话引擎（多格式 provider + SSE + 上下文压缩 + 工具调用循环）
2. Skill 系统（目录约定 + frontmatter 解析 + 渐进注入 + zip 导入导出校验）
3. 小说项目文件模型（目录即数据库 + 快照/回撤）
4. 双通道同步（WebDAV 增量 zip + 局域网 HTTP:8917 共享区 + 二维码配对）
5. 字体/外观/提示音个性化
6. 自更新（多源下载 + SHA256 + 平台安装）

**字符串证据文件**（本目录下可直接检索）：
- `strings-win-py.txt` / `strings-apk-py.txt`：全量字符串
- `zh16-win.txt` / `zh16-apk.txt`：UTF-16LE 提取的中文文案（Dart TwoByteString）
- `zh16-final.txt`：过滤后 3638 条功能文案
- `channels.txt`、`api-paths.txt`、`db-hints.txt`

**未竟事项**：Dart AOT 的完整类/方法级还原需要 blutter（需 Linux/WSL 环境 + 匹配 Flutter 引擎版本，本机无 WSL 未执行）。现有字符串级证据已覆盖全部功能面与数据模型；如需函数级伪代码，装 WSL2 后对 `libapp.so`+`libflutter.so` 跑 blutter 即可。
