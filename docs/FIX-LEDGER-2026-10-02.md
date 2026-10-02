# DeepCompose 修复台账（2026-10-02，B12 批次）

> 用法：修一条划一条。状态：⬜ 未修｜✅ 已修（含提交批次）｜🔶 部分修复/按裁决记录。
> 来源：`docs/AUDIT-2026-10-02-external.md`（40 条）+ 自查新发现（58 条）。

## 一、审计条目（I/A/B/C/D/E/F，40 条）

| 条目 | 状态 | 说明 |
|---|---|---|
| I-1 清单判据不一致（半可见作品） | ✅ | 批次2：projectExists 判据与可见性统一（清单或内容目录） |
| I-2 年代错误无 lint 机制 | ⬜ | |
| I-3 「待填写」不可结构化查询 | ⬜ | |
| I-4 伏笔自述数量无落点 | ⬜ | |
| I-5 isSystemEntryName 三条判定叠加 | ✅ | 批次2：收敛为 SYSTEM_ENTRY_RULES 单一规则表 |
| I-6 附加文档无登记 | ✅ | 批次2：KNOWN_EXTRA_DOCS 登记 |
| I-7 内容树 4 层静默截断 | ✅ | 批次2：上限升 10 层 + truncated 标记；批次5 UI 接线（树节点「…已截断」标记） |
| I-8 章节摘要模板占位与回写冲突 | ✅ | 批次2：移除模板章节占位 |
| I-9 表格型内容无节可定位 | ⬜ | |
| I-10 skill-creator 教不存在的工具 | ⬜ | |
| I-11 KNOWN-LIMITS 定位矛盾 | ⬜ | |
| I-12 无导入动作/导入校验 | ✅ | 批次2：validateProject（只读校验）；批次5 UI 接线（打开作品即校验，状态条汇总） |
| A-1 审计脚本导航索引错位 | ✅ | 批次6：三脚本导航序号改为 data=5 / about=6（与 SettingsScreen navItems 6 项一一对应） |
| A-2 tests/ 不做类型检查 | ✅ | 批次6：tsconfig include 加 tests + @types/node；实测注入类型错误 tsc exit 2（复现口径同审计附录），测试替身随之补齐 isLink/removeChild |
| A-3 ModelCombo 文档矛盾 | ⬜ | |
| A-4 _css_coverage 基线丢失 | ✅ | 批次6：git_show 检查返回码；基线丢失 exit 2（不再把空串当基线静默"全绿"） |
| A-5 duplicate_detect 正则 /s | ✅ | 批次6：/s→\s；fixture 实测 desc_overlap=0.71（0.3 权重的描述维度复活） |
| A-6 cdp_probe 连不上真机 | ✅ | 批次6：文档改为真实前提（发布版刻意不开 9223 调试口，需 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS 才有；选择器示例更新为 button.wbtn[title="设置"]）；preview_shot 进设置改按 title 精确点齿轮（不再依赖"第一个 .wbtn"） |
| A-7 preview_shot 探已删选择器 | ✅ | 批次6：探针改测当前实色体系不变量（零 backdrop-filter / 零渐变 / 零 filter:blur，含伪元素），与 _a11y_check 扁平度审计同口径 |
| A-8 builtin-skills 死资产 | ⬜ | |
| B-1 根外确认未接线 | ✅ | 批次1：guardWithConfirm + ToolContext.confirmExternal + controller 透传；批次5 UI 接线（确认弹窗 + 会话内 allowedDirs 持续生效） |
| B-2 package.ps1 跳过 tsc | ✅ | 批次6：打包第 [1/5] 步先跑 tsc --noEmit，失败即 throw |
| B-3 会话列表/删除路径口径不同 | ✅ | 批次2：listSessions 改用 samePath（含回归测试） |
| B-4 冷读不跟会话级思考档位 | ✅ | 批次1：IsolatedSendOptions.thinking + providerOf 传档；批次5 UI 传参（runColdRead 传 thinkLevel） |
| B-5 contextLimit/reservedOutputTokens 无上界 | ✅ | 批次4：NumInput 统一钳制（context 1–4096K、reserved 1–384K、maxOutput 1–384K、toolRound 1–50） |
| C-1 API Key 边输边发+落盘 | ✅ | 批次4：自动检测只对「未动过的 Key」放行（stableKeyRef）；半截 Key 不再发上游，手动检测不受限 |
| C-2 SkillSection 绕过 dirty/save | ✅ | 批次4：父级 toggleSkill 统一管道（改 form+formRef 同步、立即落盘最新表单、失败重新置脏） |
| C-3 Row/GroupHead 组件体重定义 | ✅ | 批次4：提为模块级 SkillRow/SkillGroupHead（props 化） |
| C-4 ThemeSection flash 死代码 | ✅ | 批次4：移除从未调用的 onFlash prop（flash 展示保留） |
| C-5 Ctrl+S 无条件 preventDefault | ✅ | 批次4：只在有保存动作的三页吞默认行为 + 补依赖数组 |
| C-6 !boot 兜底分支不可达 | ✅ | 批次4：删除死分支；mockBackend ?fail=prefs 注释改为指向主界面启动失败屏 |
| D-1 useDialogFocus 无 focusin 兜底 | ✅ | 批次5：模态栈 + focusin 兜底 + 归还纪律（重写 useDialogFocus） |
| D-2 MainWorkbench 状态归属三件套 | ✅ | 批次5：冷读开窗重置选项/提交校验（空选择禁提交）/continueWriting 取章号最大候选 |
| D-3 冗余/缺能力三件套 | ✅ | 批次5：RecycleBin 删 dirs 死 prop；鲸鱼面板展开期随 ResizeObserver 重定位；向导创建期禁取消（N-23 同一裁决：关窗兜底） |
| E-1 KeepCompose 残留五处 | ⬜ | |
| E-2 魔数三处各写一遍 | ✅ | 批次6：e2e_chat.ps1 改为具名常量 $LEGACY_DEFAULT_ACCENT（与 SettingsScreen 的 LEGACY_DEFAULT_ACCENT 同名同值、注释互指；十六进制 0xFF7C6AFF 各侧只写一次） |
| E-3 审计脚本闸门语义不统一 | ✅ | 批次6：_style_audit 有裸选择器即 exit 1；_css_coverage 漏项 exit 1 / 基线丢失 exit 2 / 通过 exit 0（四脚本退出码口径统一并写进 docstring） |
| E-4 工具文档覆盖缺口 | ⬜ | |
| F-1 B10/B11 未提交 | ✅ | 基线提交 603ef18（修复全程分批提交） |
| F-2 同 I-11 | ⬜ | |

## 二、自查新发现（N-01 ~ N-58）

### 高危

| 条目 | 状态 | 说明 |
|---|---|---|
| N-01 replace 按原字节匹配 CRLF 必炸 | ✅ | 批次1：EOL 容错匹配 + 替换文本归一主导 EOL（含回归测试） |
| N-02 压缩缓存短路检查点不前进 | ✅ | 批次1：命中先验尾巴预算，超限以旧检查点+尾巴为源重压（含回归测试） |
| N-03 断流丢部分正文 | ✅ | 批次1：streamError 路径保留部分消息入库 |
| N-04 moveToRecycle 先改名后写清单 | ✅ | 批次2：先记清单后搬目录 + rename 失败回滚（含回归测试） |
| N-05 进设置页卸载丢稿/丢生成态 | ✅ | 批次5：主工作台常驻挂载（display:contents/none 切换）+ suspended 闸 + onBootReplaced 重装配通道 |
| N-06 saveTabAs 返回值被忽略 | ✅ | 批次5：closeTab/资料换槽/toggleEditing 全部接住失败——写盘失败不销毁 tab |
| N-07 e2e 覆写真实配置无备份 | ✅ | 批次6：e2e_chat.ps1 先备份再覆写，finally 无条件恢复（成功/失败/中途异常一致） |
| N-08 fs_copy 无自复制/junction 防护 | ✅ | 批次3：canonicalize 自复制判定 + copy_dir 跳过 reparse point（含 nodeFs 同口径替身与测试） |
| N-09 prefs_load 吞错返回 {} | ✅ | 批次3：仅 NotFound 返回空对象，其余错误上抛 + BOM 剥离 |
| N-10 BOM 未剥离 | ✅ | 批次3：UTF-8 BOM 剥离（prefs_load 与 fs_read_text 双侧） |
| N-11 fs_read_text 硬 UTF-8 | ✅ | 批次3：decode_text 四级策略（UTF-8/UTF-16 BOM → 严格 UTF-8 → GBK 回退），nodeFs 同口径，回归测试：GBK 旧稿可读可搜 |
| N-12 search 单文件拖垮+无深度上限 | ✅ | 批次1：逐文件/目录容错 + files_skipped + 深度上限 16（含回归测试） |
| N-13 insert/delete_lines 静默归一 EOL | ✅ | 批次1：行级字节保持（splitLines/joinLines）（含回归测试） |
| N-14 Anthropic 输入统计偏低 | ✅ | 批次1：inputTokens 计入缓存读写；测试锁同步更新 |
| N-15 reasoningReplay 死线 | ✅ | 批次1：按 D-012 裁决（一律不回传）矫正注释，非实现回传 |
| N-16 脚本强杀所有 deepcompose 进程 | ✅ | 批次6：e2e_chat / e2e_live / uiwalk / package 四脚本只停「与本脚本 -Exe（或本仓库构建产物）同路径」的残留，结束只停自己启动的进程 |

### 中危

| 条目 | 状态 | 说明 |
|---|---|---|
| N-17 模态叠层 Esc 关两层 | ✅ | 批次5：escStack 模态栈（统一监听、只关栈顶；App 外壳返回逻辑成为栈底） |
| N-18 Dialogs Esc 无 isComposing 守卫 | ✅ | 批次5：escStack.onEsc 统一带 isComposing 守卫 |
| N-19 MemoModal 挂边态 Tab 陷阱 | ✅ | 批次5：useDialogFocus 挂边态不启用（open && !docked） |
| N-20 数字输入当场 clamp 吞小数点 | ✅ | 批次4：NumInput 本地持有原始文本（"0."/"-"/空不提交），完整数字即时提交、失焦归一 |
| N-21 UsagePanel 节流被卸载架空 | ✅ | 批次5：节流时间戳提升为模块级 lastBalanceFetch，跨打开周期生效 |
| N-22 设置卸载保存与 booted 竞态 | ✅ | 批次4：savePrefs 同步段先更新内存单例（失败回滚）+ doSave 未装配护栏 |
| N-23 向导创建中可 Esc/遮罩取消 | ✅ | 批次5：creating 期间 Esc/遮罩/取消键全部拦下（onCreate 在途拆向导会让结果无处落地；关窗兜底） |
| N-24 连接检测竞态覆盖手选模型 | ✅ | 批次4：detectSeq 序号丢弃迟到响应 + ensureModel 函数式判空（闭包旧 form 不再判空） |
| N-25 平台提示弹窗无焦点接管 | ✅ | 批次4：useDialogFocus 挂确认弹窗（移入+Tab 循环+归还），Esc 补 isComposing |
| N-26 purgeItem 目标缺失中断清空 | ✅ | 批次2：缺失目标直接清条目 + emptyRecycle 逐条 try/catch（含回归测试） |
| N-27 thinkingSupportedFor 严格相等 | ✅ | 批次1：sameBaseUrl 忽略尾随斜杠/大小写 |
| N-28 onboarding 子串匹配+{书名}二次替换 | ✅ | 批次2：整行锚定 + 字面{书名}转全角防二次替换 |
| N-29 parseIndex 不校验字段 | ✅ | 批次2：字段级容错（含回归测试） |
| N-30 profileFromPrefs 丢思考字段 | ✅ | 批次1：继承当前同地址档位的 thinking/reasoningEffort/supportsThinking |
| N-31 parseFrontmatter 闭合围栏误匹配 | ⬜ | |
| N-32 ai_stream 失败泄漏 AbortMap | ✅ | 批次3：客户端构建失败路径同样移除进门注册的句柄 |
| N-33 CSP null 信任边界为空 | ✅ | 批次3：显式 CSP（self + ipc + unsafe-inline 样式，object/base/form 全关） |
| N-34 token-optimizer 退出码矛盾 | ✅ | 批次6：六脚本「技能根缺失」统一 sys.exit(2)（实测 token_audit/cache_check 均 exit 2），与 token_audit 既有口径一致 |
| N-35 token_audit 自检段必崩 | ✅ | 批次6：自检段先判 token-optimizer 是否在审计根内，不在则打印 skipped（实测自定义根不再 FileNotFoundError） |
| N-36 preview_diag 异常当就绪 | ✅ | 批次6：就绪判定只认布尔 True（eval 的 {"__exception":…} 字典不再当真值）；未就绪打印页面日志并 exit 1 |
| N-37 energy/cache/SKILL 阈值打架 | ⬜ | |
| N-38 技能大小标签三处不一致 | ⬜ | |
| N-39 ds_probe 默认模型名不存在 | 🔶 | 批次6复核：**实测不成立**——GET /models（2026-10-03，本机真实 Key）返回 `['deepseek-flash','deepseek-v4-pro']`，DEFAULT_MODEL="deepseek-flash" 存在且与附录 A、platforms.ts、mockBackend 一致；按销项规则 2 记实测结论，不改代码 |

### 低危

| 条目 | 状态 | 说明 |
|---|---|---|
| N-40 叠层双 Tab 陷阱依赖注册顺序 | ✅ | 批次5（台账补记）：useDialogFocus 重写为模态栈——Tab/focusin 只认栈顶，注册顺序不再决定归属（批次5 代码注释已标 N-40，当时台账漏划） |
| N-41 closeTab updater 副作用 | ✅ | 批次5：副作用移出 setState updater（先算 next 再分别 set） |
| N-42 工具失败判定子串误标 | ⬜ | |
| N-43 无 mtime 显示 1月1日 | ✅ | 批次5：relTime 对 epoch 0/非有限值显示「时间未知」 |
| N-44 openSession 静默吞错 | ✅ | 批次5：loadSession null → 状态条提示；IO 异常接住并提示 |
| N-45 CSS 死规则+长作品名撑破 | ✅ | 批次5：memo-scope 作品名包 span（.memo-scope span 省略规则复活生效） |
| N-46 dirs.relative 不归一 / | ✅ | 批次2：比较前归一化分隔符 |
| N-47 ai.rs 错误体无界+锁 unwrap | ✅ | 批次3：错误体截 200 字符 + lock_map poison 容错（unwrap_or_else(into_inner)） |
| N-48 winstate 溢出+panic=abort | ✅ | 批次3：saturating 算术 + 尺寸夹 16384 上限 |
| N-49 fs_list/fs_stat 链接语义不一 | ✅ | 批次3：fs_list 改 symlink_metadata + is_link 字段（DirEntry/nodeFs 同口径） |
| N-50 产品身份三代同堂 | ⬜ | |
| N-51 _style_audit 未知 flow KeyError | ✅ | 批次6：启动即校验 flow 名，未知则列出可用名并 exit 2（不再抛栈 traceback） |
| N-52 sys.rs 路径回退假设 | ✅ | 批次3：USERPROFILE 缺失退回 exe 所在目录而非 CWD |
| N-53 e2e BOM 剥离 3..2 越界 | ✅ | 批次6：按长度拷贝（New-Object byte[] + Array::Copy），3 字节纯 BOM 文件正确产出空文件 |
| N-54 uiwalk 失败漏杀进程+裸文件名崩 | ✅ | 批次6：失败路径停掉自启进程；四类 step 先校验参数形态（坏步 WARN 跳过）；cap 裸文件名统一落 shots\ |
| N-55 capture.ps1 无 ErrorActionPreference | ✅ | 批次6：$ErrorActionPreference="Stop"（中途失败不再照样输出 SAVED） |
| N-56 token-optimizer 裸 except | ✅ | 批次6：裸 except → except OSError（KeyboardInterrupt/SystemExit 不再被吞；全目录 grep 无残留裸 except） |
| N-57 SKILL.md 引用不存在技能 | ⬜ | |
| N-58 saveSession 索引失败留孤儿 | ✅ | 批次2：新会话索引写失败回滚会话文件 |

---
**提交记录**：`603ef18` 基线保护 → `16c9a79` 批次1（tools/AI 核心：N-01/02/03/12/13/14/15/27/30 + B-1/B-4 核心侧）
→ `a825a37` 批次2（store/协议层：I-1/5/6/7/8/12、B-3、N-4/26/28/29/46/58）→ 批次3（Rust/文件桥：
N-08/09/10/11/32/33/47/48/49/52，encoding_rs GBK 回退 + CSP + 链接语义统一）
