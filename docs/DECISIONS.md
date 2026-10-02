# 改造裁决记录（DECISIONS）

本文件记录 **DeepCompose 改造（B0–B9）** 期间由用户逐项拍板的裁决。凡与代码行为相关的裁决，
都有对应的实现批次；凡新增配置键 / 新增磁盘文件的裁决，同时也作为**ADR 记录**（README 要求
「新增配置键必须走 ADR 记录并同步 `src/core/prefs.ts`」）。

> 事实基线（DeepSeek 官方接口）见文末附录 A；官方文档与我方记忆冲突时**以附录 A 为准**。

---

## 一、作品彻底删除

| ID | 裁决 | 说明 |
|---|---|---|
| D-001 | **两段式删除**：先「移入回收站」（可恢复），另提供「彻底删除」与「清空回收站」 | 复用早已预留但从未实现的契约名 `.openwrite_recycle\` 与 `recycle_manifest.json` |
| D-002 | 连带清理范围 = **作品目录 + 对应会话索引条目**；**快照与备忘录保留** | 快照留作审计痕迹；备忘录是全局记录，可能被作者手工引用 |
| D-003 | 四道安全门：① 目标必须是 `booksRoot` 的**直接子目录**（拒绝盘符根、拒绝 `booksRoot` 自身）；② 先 `stat` 拒 reparse point（只删链接本身，绝不穿透）；③ 输入书名全等确认；④ **活性保护**（该书正被 AI 会话/回流/冷读占用时拒绝执行） | 对应 KL-DF-10 |
| D-032 | **新增本地文件写入者**：`.openwrite_recycle\recycle_manifest.json` 从"预留契约"变成"我们在写"，形状 `{version:1, items:[{id,name,originalPath,movedAt,sizeBytes}]}`，id 形态沿用 `ids.newRecycleId()`（本地时间 + 微秒纪元） | 清单损坏/缺字段一律容错回落（坏 JSON → 空清单），回收站清单不该让删除功能瘫痪。**磁盘契约名一个字没改**（D-005） |
| D-033 | **会话级内存缓存的寿命**：压缩检查点缓存改为 **LRU 封顶 32 条** + 导出 `dropCompressCache(sessionId)`；删作品时按 `deleteSessionsForProject` 交回的 id 列表逐个丢弃 | 对应 KL-AI-11：早期只增不淘汰，会话删了摘要块还在内存里。LRU 兜住"总会有人忘了调 drop"，显式 drop 兜住"我们知道它已经死了" |
| D-034 | **快照纪律（B8 统一）**：① 一切改动盘的写路径**先落快照再动盘**（新内容已在内存里，写后哈希不依赖磁盘）；② copy / rename 的**目标侧也要各记一条写前快照**（目标不存在时记 `previousExists:false`，作为"回滚该删掉它"的依据） | 对应 KL-TL-02 / KL-TL-07。理由：两步之间崩掉时，"改了却没有回滚依据"是最坏的顺序；而覆盖目标不记快照，等于把用户的原稿直接吃掉 |
| D-035 | **删除备忘录分类 = 把该分类下的条目迁移到「默认」**（不删条目）；老文件里残留的失效分类名在界面上显示为「未归类」 | 对应 KL-ST-09。原始注释声称"由 UI 兜底展示未归类"，复核发现 UI 没有这个兜底（过滤只看当前 chips）——分类名一消失，条目就再也点不到。迁移保数据、可回退（重建同名分类再挪回去即可） |
| D-036 | **改名是「只动品牌面 + 只动一次性的构建产物路径」**：D-004 执行时连仓库目录一起改（`S:\KeepCompose` → `S:\DeepCompose`），代价是必须**删 `src-tauri\target` 冷编译**；用户数据路径（`%APPDATA%\com.writerd\writerD\`）与作品目录一个字不动 | B9 实测：目录改完后 `cargo test --lib` 立刻报 `failed to read plugin permissions … '\\?\S:\KeepCompose\…' os error 3`（cargo 指纹里存着旧绝对路径）→ 删 target 冷编译后恢复正常。改名本身还会因**旧 exe 进程仍在运行**而被拒（`Access to the path … is denied`） |

> **落地补注（B7）**：D-001–D-003 已实现，实现时补了四条原裁决没写到的约束：
> - **D-003①「直接子目录」用结构保证，而不是字符串比较**：新增受限删除命令
>   `fs_remove_child(parent, name, recursive)` —— 目标只能由「父目录 + **一个路径段**」拼出。
>   Rust 侧 `valid_child_name` 拒绝空 / `.` / `..` / 分隔符 / 冒号（NTFS ADS）/ 通配符 /
>   控制字符 / 尾随空格或点 / Windows 保留设备名（`CON`/`NUL`/`COM1-9`/`LPT1-9`，含带扩展名形态）。
>   于是路径穿越、`book:secret` 这种 ADS 尾巴、设备名在**结构上就不成立**，不依赖调用方自觉。
> - **名字规则只有一份实现**：`src/core/store/names.ts`（`childNameProblem` / `isReservedDeviceName`），
>   新建作品与删除共用 —— 之前 `createProject` 自己写了一套正则，只挡 `\ / : * ? " < > |`，
>   挡不住保留设备名与尾随点（KL-ST-02）。
> - **D-003②的 `stat` 改了语义**：Rust `fs_stat` 从 `metadata`（跟随）改为 `symlink_metadata`（看链接本身）
>   并新增 `isLink` 字段 —— 否则目录 junction 会被跟随，安全门等于没开。
> - **`fs_remove` 本身也做稳健化**：清只读属性（Windows 上只读文件会让 `remove_dir_all` 直接
>   Access is denied）→ 删除 → 失败重试 3 次（杀软/预览程序短暂占用是常态）；reparse point 只删链接。
> - **「清空回收站」是两段确认**：先普通确认（写明条数），再手打确认词 —— 一次性删光是这里最重的动作。
> - **D-002 的实际语义要说清楚**：会话是**文件 + 索引条目一起删**（原版行为，提示文案就是
>   「已移至回收站，并删除 N 个会话」），所以**还原作品不会带回会话**；快照与备忘录按裁决保留。

## 二、改名

| ID | 裁决 | 说明 |
|---|---|---|
| D-004 | 第二代改名 **KeepCompose → DeepCompose**（版本 `1.1.0`，identifier `com.deepcompose.desktop`，crate `deepcompose` / `deepcompose_lib`，产物 `DeepCompose.exe`，快捷方式 `DeepCompose.lnk`） | 在 B9 执行 |
| D-005 | **只改品牌面**：磁盘契约一个字不改（`writerd_*`、`.openwrite_*`、`recycle_manifest.json`、`flutter.*`、`com.writerd\writerD`、中文目录名） | 老作品、老配置、老会话零迁移；`AGENTS.md` 已补成「两代改名 + 冻结名清单」 |

## 三、API 供应商

| ID | 裁决 | 说明 |
|---|---|---|
| D-006 | 三平台预设：**DeepSeek 官方** / **硅基流动** / **自定义**；平台 Base URL **内置**（可改） | DeepSeek 官方：OpenAI 格式 `https://api.deepseek.com`、Anthropic 格式 `https://api.deepseek.com/anthropic`；硅基流动：`https://api.siliconflow.cn/v1`（国际站 `.com`） |
| D-007 | 具名配置可保存多个并随时切换：`ApiProfile` 扩展 `id` / `platform` / `thinking` / `reasoningEffort` / `reasoningReplay` / `supportsThinking`；新增配置键 `active_api_profile`（存 id） | **ADR（新增键）**：老条目无 `id` 时按 `name + baseUrl` 派生并写回；「与全局键一致即视为选中」的旧语义保留为回退 |
| D-008 | 模型 id **不写死**：预设 Base URL，模型清单靠「检测连接」调 `/models` 拉取 | 对应 KL-DF-08 |
| D-009 | 密钥沿用既有**明文存本地 prefs** 的格式（改加密会破坏契约与老配置）；UI 掩码显示、不回显全文、不进日志 | 密钥纪律不变：不入库、不进测试与证据 |

## 四、思考模式（DeepSeek 增强层）

| ID | 裁决 | 说明 |
|---|---|---|
| D-010 | 主界面输入框旁加**思考开关 chip** + **三档吸附滑轨**（关闭 / 低 / 高 / 最高） | 底层只有 `low/high/max` 三档真语义，故不做连续滑条（假精度）；档位带代价提示 |
| D-011 | 状态优先级：平台内置初值 → 配置级默认（每个具名配置各存一份）→ **会话级临时值**；会话级**只存内存**，不写会话文件 | 不碰磁盘契约 |
| D-012 | **回传策略（B5 实测后改写）**：本软件**一律不回传**历史 `reasoning_content` | 原策略是「按平台 + 是否带 tools 自动回传」。B5 用真实 Key 实测：带 `tools` + 历史轮缺 `reasoning_content` → **200**（不 400）；补上回传同样 200；零工具亦 200。既然官方不强求，不回传更优：省 token，且不改写历史前缀（前缀缓存按完整匹配命中，回传等于每轮追加新内容）。回归锁见 `tests/ai/agent.test.ts`「历史消息回放形态」。prefs 里的 `reasoning_replay` 字段保留兼容但**引擎不再读** |
| D-013 | 思考开启时 `temperature` / `presence_penalty` / `frequency_penalty` **置灰**并标注「思考模式下不生效」；`top_p` 标注有效区间 0.95–1.0 | 官方明确「设了不报错但无效」，静默无效是体验陷阱。现状：只发 `temperature`（官方为兼容既有软件故意不报错），不发 `top_p` |
| D-014 | 后台任务：**回流 / 压缩强制关闭思考**；冷读跟随用户开关 | 结构化输出任务，思考只增时延与 token；B4 已按此实现（`thinking: "off"` / `{...cfg, thinking:false}`） |

## 五、标题栏鲸鱼与统计面板

| ID | 裁决 | 说明 |
|---|---|---|
| D-015 | 鲸鱼走廊：**标题栏中段**，左锚 = 品牌旁视图按钮簇**右缘 + 24px**，右锚 = **设置齿轮左缘 − 24px**；走廊**运行时量 DOM** 自动计算，不写死坐标 | 窗口过窄（<120px）退化为原地浮动 |
| D-016 | 鲸鱼图形**原创极简 SVG**（单色实心 + 腹线 + 眼点 + 尾鳍缺口，形体偏圆润），**不复制 DeepSeek 商标**；跟随三主题与强调色；零渐变 | 现有 `logo.png` 本身即「抽象蓝鲸 + 笔」，气质一致 |
| D-017 | 交互：悬停 / 键盘聚焦 / 点击钉住三种打开方式；悬停有意图延迟（进 120ms、出 250ms）；鲸鱼本体为 `<button>`（键盘可达，且复用标题栏拖拽的 `closest("button")` 跳过逻辑）；`reduced-motion` 下**不游动但面板功能保留** | 功能不因动画降级而丢失 |
| D-018 | 闲置省电：**开关形式，默认开启**——面板关闭且 **45 秒**无鼠标/键盘交互则静止，鼠标移入立即恢复 | 写作台会连开数小时。**B12-8 更正**：本行原写「5 分钟」，与实现（`usage/view.ts` 的 `IDLE_AFTER_MS = 45_000`）和后来拍板的 D-031④「闲置 45s 停下游动」都不符 —— 以 45 秒为准 |
| D-019 | 面板内容：**token 统计（今日汇总：输入 / 输出 / 缓存命中 / 未命中 + 本次会话累计）+ 闲时/忙时倒计时 + 余额**；打开时 60s 节流刷新，另有手动刷新 | 余额为官方权威数据，且能在 402 之前预警 |
| D-020 | **不做「今日用量（人民币）」**（用户裁决，取消余额差值法与价格估算两种口径） | 面板不出现任何金额估算数字；`usage_stats.json` 只存 token 桶与余额快照 |
| D-021 | 闲时判定**只按官方 UTC 窗口**：峰值 = 周一至周五 `01:00–04:00`、`06:00–10:00` UTC（本地 UTC+8 = 周一至周五 09:00–12:00、14:00–18:00），其余闲时；**不内置中国法定节假日表**，面板注明「节假日未计入」 | 零维护 |
| D-022 | 平台选择提示：**DeepSeek** → 非阻塞气泡「吃白饭的大肥鱼已就位」（2.5–3s 自动消失）；**硅基流动 / 自定义** → 确认弹窗（逐字使用既定文案）+「不再提示」勾选 + 按钮「仍要使用」/「换回 DeepSeek」 | 气泡文案由用户给定，逐字使用 |

## 六、契约与数据

| ID | 裁决 | 说明 |
|---|---|---|
| D-023 | **新增本地文件** `%APPDATA%\com.writerd\writerD\usage_stats.json`（按日 token 分桶 + 余额快照 + 最近错误），**additive 契约**，可随时删除 | README 契约表已加行；与 `shared_preferences.json`、`window_state.json` 同目录 |
| D-024 | 上限放宽：`contextLimit` → **1M**、`maxOutputTokens` → **384K** | 对应 KL-DF-09（原钳在 200K） |
| D-025 | 引擎侧**不传 `user_id`**（少一个变量）；**不内置价格表** | 官方 `user_id` 只做内容安全/KVCache/调度隔离，且要求 `[a-zA-Z0-9\-_]+` |
| D-026 | 闸门口径不变：`tsc --noEmit` 干净 + `vitest run` 全绿 + `cargo test --lib` 全绿（**永不跑 `--release`**）；每批原子提交并附实测输出 | 基线（随批次滚动刷新）：vitest **456 例 / 34 文件**、cargo 19 例（B12 批次8 实测；旧值 390/404 曾在两处文档里不一致） |
| D-027 | **ADR（新增配置键）**：`platform_notice_dismissed`（boolean，DeepCompose 扩展键）——D-022 的「不再提示」需要一个持久位；缺失按 `false`，与既有键同文件，只写不删 | 已同步 `prefs.ts` 的 `Prefs` / `DEFAULT_PREFS` / `KEY_MAP` / `parsePrefs` 四处；新增键必须四处同改（本 ADR 即该纪律的实例） |
| D-028 | 思考档位的 **UI 入口只做「会话级」**（主界面输入区 chip + 四档浮层，只存内存）；配置级默认（具名配置的 `thinking` / `reasoningEffort`）**本批不开设置页入口**——用户已确认会话级为准，且旧版设置页从来没有这两个字段的编辑器；字段保留兼容并参与 D-011 的回落链 | 回落链：会话级 > 配置级 > 平台内置初值（开启 + high）。若将来要在设置页暴露，按 D-027 的四点同步纪律走 |
| D-029 | **思考参数的最终形状（B5 真实 Key 实测）**：两种协议**开关都是** `thinking: {type: "enabled"|"disabled"}`；档位 OpenAI 用 `reasoning_effort`、Anthropic 用 `output_config.effort`；非 DeepSeek 端点一个字段都不发 | 实测否掉了两种"文档直觉写法"：Anthropic 的 `reasoning.effort: "none"` **关不掉思考**（thinking_delta 仍有 68 个），`thinking.type:"disabled"` 才是真开关（thinking_delta = 0）。证据：`tools/ds_probe.py --only anthropic/anth2` |
| D-030 | **ADR（新增配置键）**：`whale_idle_pause`（boolean，默认 `true`，DeepCompose 扩展键）——标题栏鲸鱼「闲置时停下游动」的开关需要一个持久位；键缺失/非法一律按 `true`（默认开） | 已同步 `prefs.ts` 四处（`Prefs` / `DEFAULT_PREFS` / `KEY_MAP` / `parsePrefs`）+ `tests/core/prefs.test.ts` 往返用例（键缺失 → true；显式 false 能存住） |
| D-031 | **鲸鱼的几何与交互**：① 走廊 = 「面板开关簇右缘 + 24px」到「设置齿轮左缘 − 24px」，24px 与标题栏 gap 都由 CSS 变量单点定义（`--whale-gutter` / `--tb-gap`），JS 只**实测**跨度（ResizeObserver）后写进 `--whale-span` 供关键帧用；② 展开状态是三个来源的**并集**（悬停预览 120ms / 点击钉住 / 键盘聚焦），不是单个布尔取反；③ `prefers-reduced-motion` 下完全不游动（无障碍优先于装饰）；④ 闲置 45s 停下游动，开关见 D-030 | ②的原因是实测出来的：早先用「单 open + 点击取反」时，鼠标点一下会先触发 focus 展开、紧接着的 click 又把它关掉 —— 表现是"点鲸鱼什么都不弹"。另记一个 CSS 陷阱：`.surface-raised` 的 `raise-in` 动画末帧是 `transform: none`（fill-mode: both），**动画声明在层叠里压过普通声明**，所以面板的让位量必须用 `margin-left` 而不是 `transform: translateX`，否则一开就被清成 identity、面板被窗口右缘切掉 |
| D-037 | **内置技能资产的发布链路（A-8 销项裁决，B12 批次7）**：① 5 个随包技能由构建期 `import.meta.glob(?raw, eager)` 内联进 JS（**单文件 exe 运行时磁盘上没有 `assets/`**，这是唯一可行路径）；② 启动装配时释放到技能根（`prefs.custom_skills_dir` 或默认 `Documents\skills`），**只补缺失、绝不覆盖**——目标技能目录已有 `SKILL.md` 就整体跳过；③ 由此**内置技能升级不自动替换旧副本**（用户改过的那份是最高权威），需要用户自行删除旧目录后重启；④ `BUILTIN_SKILL_NAMES` 扩为 5 个（旧值 2 个是"资产没有发布链路"年代的实测口径），首扫默认全部开启；⑤ `__pycache__/`、`.pyc` 与含 `..` 的资产路径一律不释放 | 对应 A-8。回归锁 `tests/core/skillsBuiltin.test.ts`（资产非空 / 资产目录集合 = 内置名单 / 跳过用户副本 / 单技能失败不阻断其余 / 路径穿越与 pyc 不释放）。非用户裁决，属 2026-10-03「全程自主决断」授权下的维护批次裁决 |

---

## 附录 A：DeepSeek 官方接口事实基线（文档抓取）

> 以下为改造规划阶段从官方文档抓取的结果。**与记忆冲突时以本附录为准**；若与本附录冲突的是
> 官方最新文档，则以官方为准并回来更新本附录。

来源：
- [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [Your First API Call](https://api-docs.deepseek.com/)
- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)
- [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls)
- [Context Caching](https://api-docs.deepseek.com/guides/kv_cache)
- [Rate Limit & Isolation](https://api-docs.deepseek.com/quick_start/rate_limit)
- [Error Codes](https://api-docs.deepseek.com/quick_start/error_codes)
- [Get User Balance](https://api-docs.deepseek.com/api/get-user-balance)

### 1. 模型与端点

| 项 | 值 |
|---|---|
| 模型 | `deepseek-flash`（DeepSeek-V4.1-Flash）、`deepseek-v4-pro`（DeepSeek-V4-Pro-0813） |
| 旧名 | `deepseek-v4-flash`、`deepseek-v4-flash-vision-exp` 仍接受但**已退役**，由 V4.1-Flash 承接、按 Flash 计费 |
| Base URL（OpenAI 格式） | `https://api.deepseek.com` |
| Base URL（Anthropic 格式） | `https://api.deepseek.com/anthropic` |
| 上下文 / 最大输出 | **1M / 384K** |
| 并发上限（账号级，与 Key 无关） | flash 2500、v4-pro 500 |
| 能力 | JSON 输出 ✓、工具调用 ✓、Responses API ✓、Anthropic API ✓、Chat Prefix（Beta）✓、FIM（仅非思考模式）、Vision（flash ✓ / pro ✗） |

### 2. 思考模式参数（三种格式）

| | OpenAI 格式 | Anthropic 格式 |
|---|---|---|
| 开关 | `{"thinking": {"type": "enabled/disabled"}}` | `{"reasoning": {"effort": "none/low/high/max"}}`（`none` 即关闭） |
| 档位 | `reasoning_effort: low/high/max` | `output_config.effort: low/high/max` |

- 思考模式**默认开启**，默认 effort = `high`。
- effort 别名映射：`minimal/low → low`、`medium/high → high`、`max → max`、`xhigh/ultra → max`。
  **真正有区分度的只有 low / high / max 三档**。
- **实测补注（B5，2026-08，deepseek-flash，`tools/ds_probe.py --only effort2`）**：
  - 不带任何思考字段 → 默认开启（响应里 733 个 thinking_delta）；
  - `thinking:{type:"disabled"}` → thinking_delta = 0（**这才是开关**）；
  - Anthropic 格式的 `reasoning:{effort:"none"}` → thinking_delta **仍有 68 个**（关不掉，文档该行易误读）；
  - `reasoning_effort` 三档确实不同（同一简单题：low 42 / high 32 / max 69 reasoning_tokens），
    但小样本下**非单调**，别把它当"越高质量越好"的旋钮。

### 3. 思考模式下的采样参数

- `temperature`、`presence_penalty`、`frequency_penalty`：**设了不报错，但完全无效**（官方为兼容既有软件故意不报错）。
- `top_p`：**只在思考模式生效**，有效区间被夹到 `0.95–1.0`（低于 0.95 按 0.95）；非思考模式固定 `1.0`，所填值被忽略。

### 4. 工具调用

- 思考模式下**支持工具调用**（V3.2 起）。
- Chat Completions **不支持在对话中间插入 tool call**（Anthropic 格式与 Responses API 支持）。
- `strict` 模式为 Beta（需 `/beta` 端点）：要求所有 object 属性都 required + `additionalProperties: false`，
  不支持 `minLength` / `maxLength` / `minItems` / `maxItems` —— **我们现有工具 schema 不满足，默认不开**。

### 5. `reasoning_content` 回传规则（关键）

- 思考内容在 `reasoning_content` 字段返回，与 `content` 同级。
- **请求不带 `tools`**：历史 `reasoning_content` 不必回传，传了也被忽略、不进上下文。
- **请求带 `tools`**：所有历史轮的 `reasoning_content` **必须完整回传**（含模型未调用工具的那些轮）。

### 6. 用量、缓存与余额

- `usage` 含 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`（磁盘上下文缓存，默认开启，best-effort）。
- **实测补注（B5，`tools/ds_probe.py --only cache`）**：OpenAI 格式一条响应里**两套缓存字段同发**——
  `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` 与 `prompt_tokens_details.cached_tokens`；
  同一前缀第二次请求命中 2048/2287（首次 0）→ 缓存确实生效且可观测。
  Anthropic 格式给的是 `{input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens, service_tier}`。
  `completion_tokens_details.reasoning_tokens` 也在（思考 token 的可观测口径）。
  另：`max_tokens: 384000` 与 3.8 万 token 的输入都被接受（D-024 成立）。
- 缓存按「前缀单元」**完整匹配**命中；缓存几小时到几天自动清理；**改写历史前缀会打掉缓存**。
- `GET /user/balance` → `is_available` + `balance_infos[{currency: CNY|USD, total_balance, granted_balance, topped_up_balance}]`。
- **API Reference 里没有「按日用量 / 账单」端点**（只有余额）→ 这也是本改造放弃人民币用量估算的直接原因之一（D-020）。

### 7. 错误码

`400` 请求体格式错误 / `401` 鉴权失败 / `402` **余额不足** / `422` **参数无效** / `429` 限流 /
`500` 服务端错误 / `503` 服务端过载。**官方错误码列表里没有 404** → 404 基本等价于「URL 写错」。

### 8. 保活与超时

- 流式请求会持续返回 SSE 注释行 `: keep-alive`；非流式持续返回空行。
- 请求发出后 **10 分钟未开始推理**，服务端关闭连接。
- **实测补注（B5，`tools/ds_probe.py --only keepalive`）**：本轮 6 组请求（含 900 token 长思考、
  3.8 万 token 前缀）**都没有出现**注释行——它只在服务端排队等待时出现，按需触发、不可召之即来。
  解析层因此按"白名单"实现（只有 `event:` / `data:` 算数据），不依赖是否见过注释行。

### 9. 价格时段（仅用于理解闲时/忙时）

- 峰值时段：**UTC 周一至周五 01:00–04:00、06:00–10:00**（不含中国法定节假日）；其余时段（含周末与法定节假日全天）为谷价。
- 谷价 = 峰价一半。官方保留调价权。