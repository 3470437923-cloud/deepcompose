# 已知边界与缺陷账本（KNOWN-LIMITS）

本文件是 **B0–B11 改造期审计条目的全量账本**：每条都保留原文与最终处置
（`保留` / `已修 <批次或提交>` / `复核结论`），**已修条目不删除**——这是 §6 销项规则的刻意设计，
免得下一个接手的人重新发现、重新踩一遍。查"现在还有什么没修"请只看「处置」列为 `保留` 的行；
查 B12 轮（外部审计 40 条 + 自查 58 条）的修复进度看 `docs/FIX-LEDGER-2026-10-02.md`。

> **I-11/F-2 销项说明（B12 批次7）**：本文件头曾自称「唯一的『只报告未修』清单」，与形态矛盾
> （表内 20+ 条处置为 `已修`，且 B12 起另有 FIX-LEDGER 台账）——现改为如实描述：
> 「全量账本 + 处置列」，不再自称"唯一"或"只报告未修"。

**计数口径**：按审计报告的条目粒度——`core/ai` 17 条（含维护批次新增的 KL-AI-17）、`core/store` 8 条、
`tools/skills/root` 10 条；每条可含多个子项，展开后共 42 项，表中以子编号标注。
（各条现状以「处置」列为准，本行只记入账时的粒度口径。）

**证据等级**（沿用 README「证据先行 / 不臆造」纪律）：

| 等级 | 含义 |
|---|---|
| `[已实测]` | 有当场跑出的输出（命令 + 结果）作为依据 |
| `[代码判定]` | 读代码即可确定，不需要运行 |
| `[推演]` | 由代码逻辑推导成立，但未构造专门用例 |
| `[待实测]` | 需要真实上游 / 真机才能定论，**不得用常识补全** |

**处置**：`保留`（有意为之或风险可接受）/ `本轮修`（标注批次）/ `已修`（标注提交）。

---

## 1. core/ai（17 条）

| ID | 问题 | 触发条件 | 等级 | 处置 |
|---|---|---|---|---|
| KL-AI-01 | 连接建立期点「停止」无效：Rust 侧未在连接阶段注册中断句柄，停止只对已开始读取的流生效 | 上游 DNS/TLS 慢或挂起时点停止 | 已实测 | **已修** `c5854d4` |
| KL-AI-02 | Anthropic 流式 usage 重复累计：`message_delta.output_tokens` 是**累计值**，代码却做 `+=`（且 `message_start` 里那个占位 output 也被计入） | 读该字段者会拿到膨胀数倍的值 | 代码判定 | **已修**（B2：解析层只发上游真给了的字段，累加层改为「回合内覆盖、跨回合求和」，并补 4 个回归锁） |
| KL-AI-03 | SSE 多行 `data:` 不支持（规范允许同一事件多条 data 行拼接后再解析） | 上游把长 JSON 拆成多条 data 行 | 代码判定 | 保留（现有测试锁「逐行立即出事件」） |
| KL-AI-04 | `tool_calls` 分片缺 `index` 时全部归并到 0，多个并发工具调用会拼坏 arguments | 非标上游不发 `index` | 推演 | 保留（标准上游都带 index） |
| KL-AI-05 | Anthropic 历史回放不带 thinking 块 | 官方 extended thinking + 工具链场景可能 400 | 代码判定 | 保留（B5 按平台策略统一处理后复核） |
| KL-AI-06 | `finish_reason="length"` 无专门处理：被 max_tokens 截断时静默收尾，用户看不出被截断 | 长章续写撞上输出上限 | 代码判定 | **已修**（B5 + 2026-10-04 增强）：`isTruncatedReason` 认两种叫法（OpenAI `length` / Anthropic `max_tokens`）→ `AgentEvent.truncated` → `SendResult.truncated` → 聊天区 warn 色提示条（`.notice-line`）。**增强（D-040/D-041）**：默认 max_tokens 提到 128K；截断时自动续写至多 3 程拼成一整条（有工具调用的回合不续写），用尽仍截断才标记提示 |
| KL-AI-07 | `cleanup_started` / `cleanup_completed` 事件名在联合类型里是死类型（无发射点） | — | 代码判定 | 保留（事件名表属既有格式） |
| KL-AI-08 | `question` 弹窗不随「停止生成」关闭，停在屏幕上等用户点 | 生成中弹问题、用户点停止 | 已实测 | **已修** `c5854d4` |
| KL-AI-09 | 压缩阈值判定不含本轮新用户消息，压缩延后一轮才触发 | 单条超长消息过后才压缩 | 代码判定 | 保留（可接受） |
| KL-AI-10 | 会话在 `runAgent` 返回后一次性落盘：生成过程中崩溃/被杀会丢本轮全部消息 | 进程被强杀、断电 | 代码判定 | 保留（分段落盘会牵动索引一致性语义） |
| KL-AI-11 | 压缩模块级缓存按 sessionId 增长、**永不淘汰**；会话删除后仍留在内存里 | 长时间多会话运行 | 代码判定 | **已修**（B7）：改为 **LRU 封顶 32 条**（`COMPRESS_CACHE_MAX`，命中/写入都挪队尾，超限丢队首）+ 导出 `dropCompressCache(sessionId)`；删作品时按 `deleteSessionsForProject` 交回的 id 逐个丢弃。回归锁：`tests/ai/compress.test.ts`（drop 后重新摘要 / 塞满 33 条后最早那条被挤出去）|
| KL-AI-12 | 压缩观测信息借 `error` 事件通道上报，非致命提示走红色报错样式 | 触发压缩时 | 代码判定 | 保留（无独立 notice 通道，属设计取舍） |
| KL-AI-13 | 压缩后无二次预算校验，极端情况靠上游 400 兜底 | 摘要自身超预算 | 推演 | 保留（错误文案逐字冻结） |
| KL-AI-14 | `CHECKPOINT_MERGE_RULES` 生产路径实际不可达（检查点永不进会话文件） | — | 代码判定 | 保留（被测试锁定，动它要改测试） |
| KL-AI-15 | `missingConfigError` 复用「Key 无效」文案 | 未配置时 | 代码判定 | 保留（九条错误文案属冻结口径） |
| KL-AI-16 | 404 一律映射「该模型不存在或暂无可用渠道」，Base URL 写错也这样报 | 多平台切换后填错 URL | 代码判定 | **已修**（B5）：官方错误码表里没有 404 → 文案改为「接口地址或模型不存在……出现 404 基本都是接口地址（Base URL）写错了」；另补 402 余额不足、422 参数无效两条官方码 |
| KL-AI-17 | `protocol.buildOpenAi` 把「空回合」assistant（`text` 为空且无 `toolCalls`，通常只有思考流）序列化成 `{role:"assistant", content:null}` 且不带 `tool_calls` → DeepSeek 400 `invalid_request_error`「Invalid assistant message: content or tool_calls must be set」；该消息一旦落盘，**这个会话之后每次发送都整轮失败**（Anthropic 分支同形态会发空 text 块，同样被拒） | 模型只产出思考、或用户在中途点「停止」后留下 thinking-only 回合；下一次发送即触发 | 已实测（真实会话 `123a86e8…` 第 12 条即此形态，之后连续三次发送全 400；用户现场报错原文一致） | **已修**（维护批次 2026-10-04）：两条协议构造请求时**跳过空回合**（无正文且无工具调用即整条不入请求序列；思考内容按 D-012 本就不回传，无信息损失）。回归锁 `tests/ai/protocol.test.ts`（2 例：OpenAI/Anthropic 各一条，并锁定"正文非空或带工具调用的 assistant 照常保留"）；另用真实会话文件临时取证：磁盘上脏消息 1 条 → 修复后请求体内非法 assistant 0 条、工具配对不变量完整 |

## 2. core/store（8 条 / 17 个子项）

| ID | 问题 | 等级 | 处置 |
|---|---|---|---|
| KL-ST-01 | `chapter.ts`：中文数字**连写**被判为一个数（「一二三」→ 3） | 代码判定 | 保留（命名罕见，回归锁已锁现状） |
| KL-ST-01b | `chapter.ts`：混写数字回落 null（「3十」「1万」） | 代码判定 | 保留 |
| KL-ST-01c | `chapter.ts`：不识别「第1.5章」这类小数章号 | 代码判定 | 保留 |
| KL-ST-02 | `project.ts`：`createProject` 不校验 Windows 保留设备名（`CON`/`NUL`/`AUX`…），建了也写不进去 | 代码判定 | **已修**（B7）：名字规则提到 `store/names.ts`（单一来源，删除路径同一份），新建作品在建目录前就挡掉保留设备名 / 冒号(ADS) / 尾随空格或点 / 控制字符，错误信息是人话。回归锁：`tests/store/project.test.ts`（`CON`/`nul.md`/`COM1`/`第1章.md:payload`/`雾都.` 全拒，`COM0`/`console` 不被误伤） |
| KL-ST-03 | `project.ts`：`exists → mkdir` 非原子，两处并发创建同名书会撞 | 推演 | 保留 |
| KL-ST-04 | `project.ts`：`scanBooksRoot` 只跳过 `.` 前缀条目——`booksRoot` 下若出现 `writerd_*` 目录会被当成作品列出 | 代码判定 | **已修**（B7）：改用 `isSystemEntryName`（覆盖 `.` 前缀、`writerd_*`、`recycle_manifest.json`）。回归锁：`tests/store/project.test.ts`（`writerd_backup` 与同名清单目录都不出现在作品表里） |
| KL-ST-05 | `markdown.ts`：`parseSections` 不识别代码围栏，` ``` ` 块内以 `#` 开头的行会被当标题 | 代码判定 | 保留（回写仍走格式优先，风险局限于解析） |
| KL-ST-06 | `manifest.ts`：损坏 JSON 直接抛错（由 `loadProject` 兜底） | 代码判定 | **保留（判定为契约，非缺陷）** |
| KL-ST-07 | `snapshot.ts`：`recordSnapshot` 读-改-写非原子，同会话并发会丢条目 | 代码判定 | **已修**（B8）：`recordSnapshot` 经进程内串行队列（读→追加→写回整条链排队，与 `session.ts` 同一手法）；队列永不因前序失败而拒绝，异常仍抛给各自调用方。跨进程双开仍不在本层范围（见 KL-ST-08）。回归锁：`tests/core/app.test.ts` 同款幂等纪律 + 工具层快照顺序用例 |
| KL-ST-07b | `snapshot.ts`：`parseSnapshots` 不逐条校验元素形态，坏条目直接进内存 | 代码判定 | 保留 |
| KL-ST-08 | `session.ts`：索引串行化只覆盖单进程——**双开应用会互相覆盖 `index.json`** | 推演 | 保留（需要文件锁，跨进程锁是独立议题） |
| KL-ST-08b | `session.ts`：`titleFromText` 按 UTF-16 码元截断，emoji 会被截成半个代理对 | 代码判定 | 保留 |
| KL-ST-08c | `session.ts`：`parseSession` 不逐条校验消息形态 | 代码判定 | 保留 |
| KL-ST-09 | `memo.ts`：`removeCategory` 不迁移该分类下的备忘录（条目仍指向已删分类） | 代码判定 | **已修**（B8）：删除分类时**把该分类下的备忘录迁移到「默认」**。原注释声称「由 UI 按『未归类』兜底展示」，复核发现 UI 根本没有这个兜底 —— 过滤只看当前 chips（`MemoModal` 的 `visible`），分类名一消失条目就再也点不到；迁移保数据、可回退（重建同名分类再挪回去即可）。另给**老文件**里残留的失效分类名补了「未归类」显示兜底。回归锁：`tests/store/memo.test.ts`（迁移 2 条 + 删不存在的分类原样返回） |
| KL-ST-09b | `memo.ts`：`newMemo` 同毫秒会撞 id | 推演 | 保留 |
| KL-ST-10 | `oplog.ts`：`diffLines` 对纯 EOL 变化（CRLF↔LF）不计差异 | 代码判定 | 保留（有意为之） |
| KL-ST-10b | `oplog.ts`：`readOplog` 全量读，日志极大时慢 | 代码判定 | 保留 |
| KL-ST-11 | `markdown.ts`：节定位只按 ATX 标题 —— 表格与逐章状态矩阵没有可定位的节，`appendToSection`/`replaceInSection` 对表格型内容只能整段追加（外部审计 I-9） | 代码判定 | **保留（按裁决记录，B12 批次7）**：当前产品路径**不受影响** —— 采用回写的「增量更新追踪表」由模型用 `file_write` 的 `operation:"replace"`（上下文匹配 + EOL 容错，见 `exec.ts`）完成，不经过这两个函数；且这两个函数**目前没有生产调用方**（只有 `tests/store/markdown.test.ts` 的回归锁守着格式优先语义）。若将来把增量回写搬进 TS，**必须先补「表行定位」**（表头列名 + 首列键值），否则表格型文档无法做节内更新。判定依据与边界同时写进了 `markdown.ts` 模块头 |

## 3. tools / skills / 核心根（10 条）

| ID | 问题 | 等级 | 处置 |
|---|---|---|---|
| KL-TL-01 | `registry.availableSkillsBlock` 注入块是无换行拼接，与注释宣称的「逐字 4 片段」不一致 | 代码判定 | **已复核（B8），字节保持不动**：B8 去证据库里找过样本 —— `cjk_exe.tsv` 里能查到块头那句中文（`0x0039F8BA`），但**纯 ASCII 的 `<skill>`/`</skill>` 片段天生不在"含中文字符串"抽样里**（计数 0 不等于不存在），运行期请求体也没有留档 → **手里的证据不足以判定原产品发的是哪种排版**。处置：不改注入字节（无据不改契约，标签间空白对模型无语义），把注释改成与代码一致并写明"无据不改"。要真销项得先拿到原产品的请求体抓包 |
| KL-TL-02 | copy / rename 目标已存在时**直接覆盖**，且不为被覆盖目标落快照（`SnapshotOperation` 枚举里有 `copy`，暗示原产品会落） | 代码判定 | **已修**（B8）：copy / rename **先给目标记一条写前快照**（目标不存在也记一条 `previousExists:false` —— 这是"回滚时该把目标删掉"的唯一依据；存在则记 `previousContent` 与 `previousType`），再动盘。另补：copy 的源不存在时改报 `Directory not found`（原先直接落到 fs 层）。回归锁：`tests/tools/exec.test.ts`（覆盖已有目标 / 全新路径 / rename 双侧 / 源不存在） |
| KL-TL-03 | `skill_lookup` 的 schema 描述串宣称返回「base directory path + sampled file list」，实际只有 `{skill_name, content}` | 代码判定 | 保留（描述串属逐字契约，改它要同步模型行为） |
| KL-TL-04 | `resolveToolPath` 对 `C:file`（盘符相对）会拼出含冒号的路径（NTFS ADS 语义），写入必失败 | 代码判定 | **已修**（B7）：`guardPath` 在**去掉盘符前缀之后**检查冒号，命中即拒（`第1章.md:payload` 这类"根内路径 + ADS 尾巴"原本能绕过全部目录检查）。解析层 `resolveToolPath` 保持原样回报路径，判定只在 `guardPath`。回归锁：`tests/tools/pathGuard.test.ts`（含"`C:\` 的冒号不算 ADS，不许误伤"） |
| KL-TL-05 | `"Directory not found"` 文案对「文件不存在」也使用 | 代码判定 | **保留（判定为非缺陷）**（被测试锁为既有文案） |
| KL-TL-06 | `mergeSkillList` 不清除已删技能的 `activeSkillIds` 残留 | 代码判定 | 保留（刻意保留：目录暂时不可见时不丢勾选） |
| KL-TL-07 | 快照落盘顺序不统一：`write` 先写盘后落快照，`delete`/`rename` 先落快照后动盘 | 代码判定 | **已修**（B8）：统一为「**先落快照再动盘**」（`file_write` 的五个操作都是；新内容已在内存里，写后哈希不依赖磁盘）。理由：两步之间崩掉时，"改了却没有回滚依据"是最坏的顺序。回归锁：`tests/tools/exec.test.ts` 用「写盘必定失败的桥」验证失败后快照仍在、盘上内容未变 |
| KL-TL-08 | `normalizeForCompare` 会折叠 UNC 前缀 | 推演 | 保留（推演无可利用误判，已加注释） |
| KL-TL-09 | `question` 工具不校验单项内部形态（缺 `options` 直接透传 UI） | 代码判定 | 保留 |
| KL-TL-10 | 核心根 `app.ts`：`boot()` 不幂等；`applyAccentFromPrefs` 与 `prefs.accentHex` 逻辑重复且大小写不一致 | 代码判定 | **已修**（B8）：`boot()` 改幂等（共用同一个 promise，失败则清空以允许重试；重复装配会覆盖 `booted`，界面可能拿到两份不同的 prefs 引用）；`applyAccentFromPrefs` 直接调 `prefs.accentHex`（单份实现；CSS 十六进制大小写不敏感，但两处各写一遍迟早漂）。回归锁：`tests/core/app.test.ts`（并发只装配 1 次 / 启动后零 invoke / 失败可重试） |

---

## 4. 本轮改造引入的新风险（规划期发现，尚无代码）

| ID | 问题 | 为什么重要 | 等级 | 处置 |
|---|---|---|---|---|
| KL-DF-01 | DeepSeek 流式请求会持续返回 **SSE 注释行 `: keep-alive`**，非流式持续返回空行；10 分钟未开始推理服务端断连 | 解析器若不跳过 `:` 开头行与空行，会被当数据行处理 | 已实测 | **已核实 + 加锁**（B5）：`parseSseLine` 本就是白名单（只有 `event:` / `data:` 算数据），注释行/空行/`retry:` 一律 null；真实请求 6 组（含 900 token 长思考与 3.8 万 token 前缀）**未观测到**注释行（按需触发，不可召之即来）→ 用合成样本锁住跳过行为 |
| KL-DF-02 | 带 `tools` 的请求里，历史轮缺 `reasoning_content` 会不会 400？（官方只规定「有则必须完整回传」） | 决定「中途切思考开关 / 跨平台切换」要不要自动开新推理段 | 已实测 | **结论：不会 400**（B5 真实 Key：带 tools + 历史缺 `reasoning_content` → 200；补回传 → 200；零工具 → 200）→ 本软件**一律不回传**（D-012 改写），不用存思考内容、不动会话落盘契约 |
| KL-DF-03 | 长会话触发压缩后（整轮被检查点摘要替换）是否仍满足回传规则？ | 压缩与 DeepSeek 回传规则的交互，可能是 400 来源 | 已实测 | **结论：无此风险**（B5）：既然我们不回传历史思考内容（KL-DF-02），压缩改写的是**我方历史**，不触发"缺字段"判定；压缩后的请求体与 KL-DF-02 的 A 组同形（已实测 200） |
| KL-DF-04 | 思考模式下「压缩」可能打掉 DeepSeek 前缀缓存（缓存按前缀完整匹配），省钱方向可能反转 | 影响压缩阈值策略 | 已实测 | **结论：权衡真实存在，策略保持现状**（B5）：同一前缀第二次必然命中（实测 2048/2287，首次 0），而压缩/摘要**改写历史前缀**→ 下一次必 miss。压缩换来的是不超上下文，代价是那次 miss；阈值不改，先把命中数暴露给用户看（KL-AI-02 的统计口径） |
| KL-DF-05 | Anthropic 格式的思考开关与档位落在**两个不同字段**（`reasoning.effort` 与 `output_config.effort`），最易写错 | 一处写错就是 400/静默无效 | 已实测 | **已修**（B5）：开关 = `thinking:{type:enabled/disabled}`（与 OpenAI 同名），档位 = `output_config.effort`。实测否掉两处直觉写法：`reasoning.effort:"none"` **关不掉**（thinking_delta 68 个）；不带字段则默认开启。回归锁见 `tests/ai/protocol.test.ts`。见 D-029 |
| KL-DF-06 | DeepSeek `strict` 模式（Beta，需 `/beta` 端点）要求所有 object 属性 required + `additionalProperties:false`，且不支持 minLength/minItems 等 | 我们现有工具 schema 不满足 → **默认不开** | 文档判定 | 保留（不启用；将来要开需先改造 schema） |
| KL-DF-07 | 硅基流动是否接受 `thinking` 参数？（不接受而我们发了 → 422） | 决定参数过滤策略 | 待实测 | **默认策略已落地**（B4）：按**请求地址**判定，非 DeepSeek 端点默认一个思考字段都不发（档位 chip 直接禁用）。**仍无法实测**：本机只有 DeepSeek 官方 Key，没有硅基流动 Key → 不猜、不放行（保持"不发"这条安全默认） |
| KL-DF-08 | 硅基流动的默认模型 id 无法凭记忆断言 | 写死就是错误预设 | 未知 | **不写死**：预设 Base URL + 运行时 `/models` 拉取 |
| KL-DF-09 | `maxOutputTokens` 的**设置页上限被钳在 200K**（原描述写成「`contextLimit` / `maxOutputTokens` 都被钳在 200K」**不准确，此处更正**：`contextLimit` 默认已是 1M 且无上限钳制），而官方最大输出是 384K | 用户想用满会被自己的 UI 挡住 | 代码判定 | **已修**（B1） |
| KL-DF-10 | 删除作品的路径安全边界：reparse point（junction/符号链接）穿透、Windows 保留设备名、含冒号的 ADS 路径 | 误删可致灾难 | 代码判定 | **已修**（B7，四道安全门 + 受限删除命令 `fs_remove_child`）：目标只能由「父目录 + 一个路径段」拼出，Rust `valid_child_name` 逐条拒绝分隔符/`..`/冒号/通配符/控制字符/尾随点/设备名；`fs_stat` 改 `symlink_metadata` 并返回 `isLink`；reparse point 只删链接本身；`fs_remove` 清只读 + 重试 3 次。回归锁：`tests/store/recycle.test.ts`（四道门逐条撞）+ `src-tauri/src/fs.rs` 的 6 个单元测试（含真盘只读目录删除与幂等） |

---

## 5. 本轮各批次修哪些（对照表）

| 批次 | 销项 |
|---|---|
| B1 | KL-DF-09 |
| B2 | KL-AI-02 |
| B4 | KL-DF-05（部分：只发 `reasoning.effort`）、KL-DF-07（按地址过滤的默认策略落地） |
| B5 | KL-AI-06、KL-AI-16、KL-DF-01（核实并加锁）、KL-DF-02/03/04/05（实测出结论并修）、KL-DF-07（无 Key，保留安全默认） |
| B7 | KL-AI-11、KL-ST-02、KL-ST-04、KL-TL-04、KL-DF-10 |
| B8 | KL-ST-07、KL-ST-09、KL-TL-02、KL-TL-07、KL-TL-10；KL-TL-01 复核后**保持字节不动**（证据不足，只改注释）；**复核后保留**：KL-AI-03/04/05/07/09/10/12/13/14/15、KL-ST-03/05/06/08/08b/08c/09b/10/10b、KL-TL-03/05/06/08/09、KL-DF-06/07/08（逐条理由见上表「处置」列） |
| B9 | **无销项**：第二代更名（D-004 / D-036）+ 冷编译交付。改名途中实测到两个**环境级**坑，已记进 `AGENTS.md` 第 5 节与 `docs/DEVELOPMENT.md`：① 目录改名后 cargo 指纹指向旧绝对路径 → `failed to read plugin permissions … os error 3`，必须删 `src-tauri\target` 冷编译；② 改名本身会被"上一次截屏留下的旧 exe 进程"挡住（`Access to the path … is denied`，旧 exe 那侧是 `KeepCompose.exe`） |
| B10 | KL-UI-02/03/04/05/06/07（复盘批：回收站常驻入口、模型自绘组合框、设置屏自动保存、思考浮层 dismiss 与按钮行换行、首条发言 `newId` 崩溃、生成中会话操作守卫） |
| B11 | KL-UI-08/09/10（最终复盘批：模型只能点选、流式滚动程序写入守卫 + 「回到底部」、开书引导向导）+ KL-UI-11~18（复审子代理发现的 8 条：null 会话回流白屏、关窗丢稿/关不掉、重置回滚、温度与字号落盘越界、usage 统计并发覆盖、回流停止团灭、备忘录写盘乱序）；另销一条测试债：`project.test.ts` 真盘用例不再断言用户可删的具体作品名 |

## 6. 销项规则

1. 本条被修 → 把「处置」改成 `已修 <提交>` 并在同批提交的测试里留下回归锁。
2. 实测出结论 → 把等级从 `待实测` 改成 `[已实测]`，并把结论写进本条（含上游版本/日期）。
3. **不得删除条目**：判定为「非缺陷」的也要留着（例如 KL-ST-06、KL-TL-05），避免后来者反复重新发现。
4. 新增已知边界 → 追加新 ID，不要复用旧编号。

---

## 7. UI / 视觉（取证时发现，未销项）

| ID | 边界 | 触发条件 | 等级 | 处置 |
|---|---|---|---|---|
| KL-UI-01 | 浅色主题下遮罩是 `--scrim: rgba(20,24,30,0.34)`（半透明），主界面空态那张高饱和强调色按钮（「新书启航」）会在对话框左缘透出一条约 4px 的蓝色细边，像是对话框上长了一根毛刺 | 浅色主题 + 作品未打开（空态）+ 任何对话框（改书名、回收站、确认框） | 已实测（B7 像素取证：`shots/b7-recycle-light.png` 对话框左缘 rgb(49,66,148) 竖条，量到 102 个像素点） | **保留**：这是遮罩的固有行为，不是删除流程引入的；试过把浅色 `--scrim` 抬到 0.42，细边仍在（只是变暗），却会改动全局视觉 token —— 为一个观感小瑕疵动全局不值，记在这里等一次真正的视觉复查 |
| KL-UI-02 | 回收站入口只藏在作品下拉菜单最底部，不展开菜单就找不到（"没有看到回收站在哪里"） | 常态 | 用户实测 | **已修**（B10）：左栏底部常驻 `.foot-recycle` 入口（角标沿用 recycleItems），作品下拉里的入口保留 |
| KL-UI-03 | 设置页模型选择用原生 `datalist`：WebView2 弹层高度/样式不受控、只按前缀过滤，长清单显示不全 | 模型清单较长时 | 用户实测 + 代码判定 | **已修**（B10）：换成自绘组合框（完整清单 + 滚动 + 子串过滤），过滤纯函数 `filterModelOptions` 有回归锁 `tests/ai/models.test.ts`。**B11 追记（A-3 销项）**：B10 那版组件名 `ModelCombo` 且可手填，B11 已被**只能点选**的 `ModelSelect` 取代（见 KL-UI-08）——`ModelCombo` 这个名字与"可手填"能力在现码中都不存在，文档不得再引用 |
| KL-UI-04 | 设置屏只认手动「保存」：不点就丢改动，且手动保存读的是当次渲染闭包里的 form，存在"保存了旧表单"的路径 | 改完直接返回 / 快速连改 | 用户实测 + 代码判定 | **已修**（B10）：全屏防抖自动保存（900ms）+ 卸载兜底落盘；唯一落盘出口 `doSave(formRef.current)`，手动/自动/兜底三路拿到的都是最新表单 |
| KL-UI-05 | 思考档位浮层没有 dismiss：不点选就永远悬在输入区与快捷指令行之上（"思考模式 UI 堆叠"）；窄面板下胶囊单行挤压互顶 | 打开浮层后点别处 / 对话面板收窄 | 用户实测 + 代码判定 | **已修**（B10）：浮层挂 `useDismiss`（点外部/Esc 收起）；`.comp-row` 允许换行；胶囊文字单行省略 |
| KL-UI-06 | 新会话首条发言即崩：`sendUserMessage` 调用了未定义的 `newId`（B9 后未提交改动的遗漏），`busy` 永久卡死，后续发言全部被吞 | 新会话第一条消息 | 代码判定（tsc TS2304） | **已修**（B10）：改用 session 模块的 `uuid()`；乐观会话只建一次并传给 `sendChat`，乐观展示与落盘同一会话 id |
| KL-UI-07 | 生成中点「新建对话」/切换会话，本轮跑完 `setSession(res.session)` 会把视图拽回旧会话 | 生成中操作会话 | 代码判定 | **已修**（B10）：`startNewChat` / `openSession` 加 busy 守卫，提示先停止再操作 |
| KL-UI-08 | 模型选择可手填：输入与已选值共用一个框，"当前生效的是哪个模型"要靠猜；长清单可读性差 | 模型清单较长 / 手误改字 | 用户实测 | **已修**（B11）：改为只能点选的 `ModelSelect`（选中高亮 + 按钮回显，筛选框只缩小列表、永不改已选值；清单 >6 条才出现筛选框；空清单给「先检测连接」引导）。`filterModelOptions` 回归锁沿用 `tests/ai/models.test.ts` |
| KL-UI-09 | 流式输出时聊天区滚不动：弹簧写 scrollTop 触发 scroll 事件，被当成"用户滚了"→ 跟随反复取消又重算 pinned，用户上滚被下一帧拽回底部 | 生成中翻历史消息 | 代码判定 | **已修**（B11）：程序写入守卫（`springScrollToBottom` 新增 beforeWrite 钩子置旗，scroll 处理器见旗即跳过）；用户上翻即让位并浮出「回到底部」钮（生成中显示「有新消息」），点它或自己发言都会重新接管跟随 |
| KL-UI-10 | 没有开书引导：新建作品只弹书名，建完就是 14 份「待填写」模板的空白书，用户不知道第一步做什么 | 每次新建作品 | 用户实测 | **已修**（B11）：`NewBookWizard` 三步向导（书名与方式 → 故事定位 → 世界与开局），答案经 `core/store/onboarding` 定向填进 01-开书定位 / 02-核心设定（只替换「待填写」整行，留空保持占位），也可选「空白开书」直接跳过。回归锁 `tests/store/onboarding.test.ts` |
| KL-UI-11 | 会话为 null 时触发回流直接白屏：`hasMessages` 把 busy 并入条件，但 `drainReflow` 只置 busy 不设会话，渲染走 `session!.messages` 非空断言 → TypeError 卸载整棵树（无 ErrorBoundary） | 从没发过消息的用户：编辑章节（非轻量改动）→ 点「完成」触发回流 | 代码判定（B11 复审发现） | **已修**（B11）：渲染改 `session?.messages ?? []`，空会话渲染空气泡区，打字指示照常 |
| KL-UI-12 | 关窗守卫两个面：保存失败（saveTabAs 返回 false）仍无条件 destroy 丢稿；`appendOplog` 未 try/catch，抛错则 preventDefault 后 destroy 永远到不了、窗口关不掉 | 有脏标签关窗 + 磁盘写失败/oplog 损坏 | 代码判定（B11 复审发现） | **已修**（B11）：`autoSaveAllTabs` 返回是否全部落盘成功，oplog 失败降级为旁路；任一标签写盘失败则**不销毁窗口**并在状态条说明 |
| KL-UI-13 | 「重置数据」只写盘不同步本地 form/不清 dirty：之后任何一次防抖/卸载兜底保存把重置前整份旧表单写回，重置被静默回滚（API Key"复活"） | 重置后在设置屏再改任意项或返回主界面 | 代码判定（B11 复审发现） | **已修**（B11）：`onReset` 同步 form + formRef 并清 dirty |
| KL-UI-14 | 温度只在 onBlur 夹取：输入越界值后 900ms 防抖自动保存抢先落盘，之后每次生成带非法 temperature 全部报错 | 温度框输入 >2 或 <0 并停留 | 代码判定（B11 复审发现） | **已修**（B11）：onChange 当场 clamp 到 [0,2] |
| KL-UI-15 | 字号框裸 `Number(v)`：清空 → 0 → 自动保存落盘，`--chat-fs/--editor-fs` 变 0px，聊天区与编辑器文字全部消失（看似"数据丢了"） | 清空字号输入框 | 代码判定（B11 复审发现） | **已修**（B11）：numGuard + 当场 clamp（对话 11–24 / 编辑器 11–28） |
| KL-UI-16 | `usage_stats.json` 三条 record* 读-改-写无串行化，并发互相整文件覆盖（KL-ST-07 同款问题在统计层的漏网） | 生成落 token 与面板刷新余额时间重叠 | 代码判定（B11 复审发现） | **已修**（B11）：进程内串行队列（与 snapshot/session 同一手法），旁路语义不变 |
| KL-UI-17 | 回流队列共用同一 abort 信号：点一次「停止」aborted 永久为 true，后续排队任务逐个判中止、整队报失败 | 多个回流排队时停止当前任务 | 代码判定（B11 复审发现） | **已修**（B11）：每个任务独立信号，「停止」只停当前这一个 |
| KL-UI-18 | MemoModal 逐键全量写盘无顺序保证：慢盘上先发的写后完成，磁盘停在旧快照丢末尾字符 | 快速长输入后立即关闭备忘录 | 推演（B11 复审发现） | **已修**（B11）：落盘经组件内 promise 队列串行，收敛到最新内容 |